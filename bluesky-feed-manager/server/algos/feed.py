import os
import json
import httpx
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer
import asyncio
import time
from server.models import Feed, FeedSource, FeedCache
from collections import defaultdict

CACHE_TTL = 60  # seconds
RESPONSE_LIMIT = 100
FEED_LIMIT = 100
MAX_PER_AUTHOR = 20

CUSTOM_API_URL = os.environ.get("CUSTOM_API_URL")

# ONNX model setup
MODEL_PATH = os.path.join(os.path.dirname(__file__), "all-MiniLM-L6-v2.onnx")
TOKENIZER_NAME = "sentence-transformers/all-MiniLM-L6-v2"

tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])

def encode_onnx(texts):
    """Return normalized embedding vectors using the ONNX model."""
    if isinstance(texts, str):
        texts = [texts]
    inputs = tokenizer(texts, padding=True, truncation=True, return_tensors="np")
    outputs = session.run(None, dict(inputs))
    embeddings = outputs[0]
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1
    embeddings = embeddings / norms
    return embeddings

# ------------------- HTTP Fetch Helpers -------------------

async def fetch_post_by_identifier(repo: str, rkey: str) -> dict:
    """Return minimal post info (just enough to build a URI)."""
    uri = f"at://{repo}/app.bsky.feed.post/{rkey}"
    return {"uri": uri, "repo": repo, "rkey": rkey}

async def fetch_full_post(uri: str) -> dict:
    """Fetch full post JSON for filtering."""
    url = f"https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris={uri}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(url)
    if r.status_code != 200:
        return {}
    posts = r.json().get("posts", [])
    return posts[0] if posts else {}

async def fetch_author_posts(actor_did: str, limit: int = RESPONSE_LIMIT) -> list[dict]:
    """Fetch posts from a Bluesky author DID."""
    url = f"https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor={actor_did}&limit={limit}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(url)
    if r.status_code != 200:
        print("Author fetch failed:", r.text)
        return []
    items = r.json().get("feed", [])

    # Concurrently convert URIs to minimal post info
    tasks = []
    for item in items:
        post = item.get("post")
        if not post:
            continue
        uri = post.get("uri")
        if not uri:
            continue
        try:
            _, _, repo, _, rkey = uri.split("/", 4)
        except ValueError:
            continue
        tasks.append(fetch_post_by_identifier(repo, rkey))
    return await asyncio.gather(*tasks)

async def search_topics(query: str, limit: int = RESPONSE_LIMIT) -> list[dict]:
    """Use vector search to find relevant posts, returning minimal identifiers."""
    vector = encode_onnx(query).tolist()[0]
    body = json.dumps(vector)
    async with httpx.AsyncClient(timeout=30.0) as client:
        r_vector = await client.post(
            f"{CUSTOM_API_URL}/vector/search/posts",
            content=body,
            headers={"Content-Type": "application/json"}
        )
    if r_vector.status_code != 200:
        print("Vector search failed:", r_vector.text)
        return []

    # Concurrently convert search results to minimal post info
    tasks = []
    for post in r_vector.json()[:limit]:
        repo = post.get("repo")
        rkey = post.get("rkey")
        if repo and rkey:
            tasks.append(fetch_post_by_identifier(repo, rkey))
    return await asyncio.gather(*tasks)

# ------------------- Filtering -------------------

def extract_filters(feed_uri: str):
    """Return sets for quick filtering."""
    rows = FeedSource.select().where(FeedSource.feed == Feed.get(Feed.uri == feed_uri))
    blocked_dids = set()
    banned_keywords = set()
    for r in rows:
        if r.source_type == "account_filter":
            blocked_dids.add(r.identifier)
        if r.source_type == "topic_filter":
            banned_keywords.add(r.identifier.lower())
    return blocked_dids, banned_keywords

def should_block_post(full_post: dict, blocked_dids: set, banned_keywords: set) -> bool:
    """Return True if post should be filtered out."""
    author = full_post.get("author")
    if author and author.get("did") in blocked_dids:
        return True
    text = full_post.get("record", {}).get("text", "").lower()
    return any(kw in text for kw in banned_keywords)

# ------------------- Feed Handler -------------------

def make_handler(feed_uri: str):
    async def build_feed(limit=RESPONSE_LIMIT):
        """Build fresh feed with concurrency."""
        sources = FeedSource.select().join(Feed).where(Feed.uri == feed_uri)
        blocked_dids, banned_keywords = extract_filters(feed_uri)
        collected = []

        # Fetch posts concurrently
        tasks = []
        for src in sources:
            if src.source_type == "account_preference":
                tasks.append(fetch_author_posts(src.identifier, limit))
            elif src.source_type == "topic_preference":
                tasks.append(search_topics(src.identifier, limit))
        results = await asyncio.gather(*tasks)

        # Flatten results
        for r in results:
            collected.extend(r)

        # Deduplicate
        seen = set()
        filtered_posts = []
        author_counts = defaultdict(int)

        # Fetch full posts concurrently
        full_posts = await asyncio.gather(*[fetch_full_post(p["uri"]) for p in collected])

        for p, full_post in zip(collected, full_posts):
            if not full_post:
                continue
            if p["uri"] in seen:
                continue
            seen.add(p["uri"])
            if should_block_post(full_post, blocked_dids, banned_keywords):
                continue
            author_did = full_post.get("author", {}).get("did")
            if author_did and author_counts[author_did] >= MAX_PER_AUTHOR:
                continue
            if author_did:
                author_counts[author_did] += 1
            filtered_posts.append(p)
            if len(filtered_posts) >= FEED_LIMIT:
                break

        feed = {
            "cursor": str(int(time.time())),
            "feed": [{"post": p["uri"]} for p in filtered_posts[:FEED_LIMIT]]
        }

        # Save to SQLite
        FeedCache.insert(
            feed_uri=feed_uri,
            response_json=json.dumps(feed),
            timestamp=int(time.time())
        ).on_conflict_replace().execute()

        return feed

    async def serve_from_cache():
        """Return cached feed if recent."""
        row = FeedCache.get_or_none(FeedCache.feed_uri == feed_uri)
        if row:
            age = time.time() - row.timestamp
            if age < CACHE_TTL:
                return json.loads(row.response_json)
            return json.loads(row.response_json)  # stale
        return None

    async def handler(cursor="", limit=RESPONSE_LIMIT):
        if not cursor:
            snapshot_id = str(int(time.time()))
            feed = await build_feed(limit)
            return {"cursor": f"{snapshot_id}:{limit}", "feed": feed["feed"][:limit]}

        snapshot_id, offset = cursor.split(":")
        offset = int(offset)
        cached = FeedCache.get_or_none(
            (FeedCache.feed_uri == feed_uri) & (FeedCache.snapshot_id == snapshot_id)
        )
        if not cached:
            return {"cursor": None, "feed": []}
        feed_items = json.loads(cached.response_json)["feed"]
        next_offset = offset + limit
        next_cursor = f"{snapshot_id}:{next_offset}" if next_offset < len(feed_items) else None
        return {"cursor": next_cursor, "feed": feed_items[offset:next_offset]}

    return handler
