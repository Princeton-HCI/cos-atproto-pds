import os
import json
import httpx
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer
import asyncio
import time
from datetime import datetime, timezone
from server.models import Feed, FeedSource, FeedCache, SearchCache
from collections import defaultdict
import random

CACHE_TTL = 60  # seconds
SEARCH_CACHE_TTL = 300  # 5 minutes for search results
RESPONSE_LIMIT = 20 # number of posts to be received from api response
FEED_LIMIT = 100 # number of total posts in a feed
MAX_PER_AUTHOR = 20 # max posts per author in a feed
MAX_AGE_SECONDS = 48 * 60 * 60  # 48 hours in seconds

CUSTOM_API_URL = os.environ.get("CUSTOM_API_URL")

# ONNX model setup
MODEL_PATH = os.path.join(os.path.dirname(__file__), "all-MiniLM-L6-v2.onnx")
TOKENIZER_NAME = "sentence-transformers/all-MiniLM-L6-v2"

tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])

def encode_onnx(texts):
    """Return embedding vectors using the ONNX model."""
    if isinstance(texts, str):
        texts = [texts]
    inputs = tokenizer(texts, padding=True, truncation=True, return_tensors="np")
    outputs = session.run(None, dict(inputs))
    embeddings = outputs[0]
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1
    embeddings = embeddings / norms
    return embeddings


async def fetch_post_by_identifier(repo: str, rkey: str) -> dict:
    """Return minimal post info (just enough to build a URI)."""
    uri = f"at://{repo}/app.bsky.feed.post/{rkey}"
    return {"uri": uri, "repo": repo, "rkey": rkey}


async def fetch_full_post(uri: str) -> dict:
    """Fetch full post JSON so keyword filters can work."""
    url = (
        "https://public.api.bsky.app/xrpc/"
        "app.bsky.feed.getPosts"
        f"?uris={uri}"
    )
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.get(url)

    if r.status_code != 200:
        return {}

    posts = r.json().get("posts", [])
    return posts[0] if posts else {}


async def fetch_author_posts(actor_did: str, limit: int = RESPONSE_LIMIT) -> list[dict]:
    """Fetch posts from a Bluesky author DID."""
    url = (
        "https://public.api.bsky.app/xrpc/"
        "app.bsky.feed.getAuthorFeed"
        f"?actor={actor_did}&limit={limit}"
    )
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.get(url)

    if r.status_code != 200:
        print("Author fetch failed:", r.text)
        return []

    items = r.json().get("feed", [])
    results = []

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

        results.append(await fetch_post_by_identifier(repo, rkey))

    return results


async def search_vector(query: str, limit: int = RESPONSE_LIMIT) -> list[dict]:
    """Use vector search to find relevant posts, returning minimal identifiers."""
    # Check cache
    row = SearchCache.get_or_none(
        (SearchCache.query == query) & (SearchCache.search_type == 'vector')
    )
    if row and (time.time() - row.timestamp) < SEARCH_CACHE_TTL:
        cached_results = json.loads(row.results_json)
        return [await fetch_post_by_identifier(r['repo'], r['rkey']) for r in cached_results[:limit]]

    # Fetch from API
    vector = encode_onnx(query).tolist()[0][0]
    body = json.dumps(vector)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r_vector = await client.post(
                f"{CUSTOM_API_URL}vector/search/posts",
                content=body,
                headers={"Content-Type": "application/json"}
            )
    except httpx.TimeoutException:
        print(f"Vector search timeout for query: {query}")
        return []

    if r_vector.status_code != 200:
        print("Vector search failed:", r_vector.text)
        return []

    results = []
    api_results = r_vector.json()[:limit]
    for post in api_results:
        repo = post.get("repo")
        rkey = post.get("rkey")
        if repo and rkey:
            results.append(await fetch_post_by_identifier(repo, rkey))

    # Cache the API results
    SearchCache.insert(
        query=query,
        search_type='vector',
        results_json=json.dumps(api_results),
        timestamp=int(time.time())
    ).on_conflict_replace().execute()

    return results


async def search_text(query: str, limit: int = RESPONSE_LIMIT) -> list[dict]:
    """Use text search to find relevant posts, returning minimal identifiers."""
    # Check cache
    row = SearchCache.get_or_none(
        (SearchCache.query == query) & (SearchCache.search_type == 'text')
    )
    if row and (time.time() - row.timestamp) < SEARCH_CACHE_TTL:
        cached_results = json.loads(row.results_json)
        return [await fetch_post_by_identifier(r['repo'], r['rkey']) for r in cached_results[:limit]]

    # Fetch from API
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r_text = await client.get(
                f"{CUSTOM_API_URL}search/posts",
                params={"q": query}
            )
    except httpx.TimeoutException:
        print(f"Text search timeout for query: {query}")
        return []

    if r_text.status_code != 200:
        print("Text search failed:", r_text.text)
        return []

    results = []
    api_results = r_text.json()[:limit]
    for post in api_results:
        repo = post.get("repo")
        rkey = post.get("rkey")
        if repo and rkey:
            results.append(await fetch_post_by_identifier(repo, rkey))

    # Cache the API results
    SearchCache.insert(
        query=query,
        search_type='text',
        results_json=json.dumps(api_results),
        timestamp=int(time.time())
    ).on_conflict_replace().execute()

    return results


# Filtering logic (blacklist plcs + keywords)
def extract_filters(feed_uri: str):
    """Return sets for quick filtering."""
    rows = (
        FeedSource
        .select()
        .where(FeedSource.feed == Feed.get(Feed.uri == feed_uri))
    )
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
    # Block authors
    author = full_post.get("author")
    if author:
        if author.get("did") in blocked_dids:
            return True
    # Block keyword-containing posts
    record = full_post.get("record", {})
    text = record.get("text", "").lower()

    for kw in banned_keywords:
        if kw in text:
            return True

    return False

# Feed handler factory
def make_handler(feed_uri: str):
    build_lock = asyncio.Lock()  # Prevent concurrent builds for the same feed
    async def build_feed(limit=RESPONSE_LIMIT):
        """Build fresh feed skeleton by fetching sources + posts."""
        sources = (
            FeedSource
            .select()
            .join(Feed)
            .where(Feed.uri == feed_uri)
        )

        # Load blacklist rules
        blocked_dids, banned_keywords = extract_filters(feed_uri)

        collected = []
        author_counts = defaultdict(int)

        # Fetch posts concurrently
        tasks = []
        seen_queries = set()
        for src in sources:
            if src.source_type == "account_preference":
                tasks.append(fetch_author_posts(src.identifier, limit))
            elif src.source_type == "topic_preference":
                if src.identifier not in seen_queries:
                    tasks.append(search_text(src.identifier, limit))
                    # tasks.append(search_vector(src.identifier, limit))
                    seen_queries.add(src.identifier)
        results = await asyncio.gather(*tasks)

        for r in results:
            collected.extend(r)

        # Deduplicate collected posts before fetching full posts
        collected = list({p["uri"]: p for p in collected}.values())

        # Fetch full posts concurrently
        full_posts = await asyncio.gather(*[fetch_full_post(p["uri"]) for p in collected])

        filtered_posts = []
        author_counts = defaultdict(int)

        for p, full_post in zip(collected, full_posts):

            if should_block_post(full_post, blocked_dids, banned_keywords):
                continue

            # Parse and check createdAt for recency
            created_at_str = full_post.get("record", {}).get("createdAt")
            if not created_at_str:
                continue
            try:
                post_time = datetime.fromisoformat(created_at_str.replace("Z", "+00:00")).timestamp()
                now = datetime.now(timezone.utc).timestamp()
                if now - post_time > MAX_AGE_SECONDS:
                    continue
            except ValueError:
                continue

            author_did = full_post.get("author", {}).get("did")
            if author_did:
                if author_counts[author_did] >= MAX_PER_AUTHOR:
                    continue
                author_counts[author_did] += 1

            # Store full_post with URI and timestamp for sorting
            filtered_posts.append({
                "uri": p["uri"],
                "timestamp": post_time
            })

            if len(filtered_posts) >= FEED_LIMIT:
                break

        # Sort posts by recency (newest first)
        filtered_posts.sort(key=lambda x: x["timestamp"], reverse=True)

        # Compute oldest timestamp for cache validation
        oldest_timestamp = None
        if filtered_posts:
            oldest_timestamp = int(min(p["timestamp"] for p in filtered_posts))

        # Format for Bluesky
        feed = {
            "cursor": "0",
            "feed": [{"post": p["uri"]} for p in filtered_posts[:FEED_LIMIT]]
        }

        # Save to SQLite
        FeedCache.insert(
            feed_uri=feed_uri,
            response_json=json.dumps(feed),
            timestamp=int(time.time()),
            oldest_timestamp=oldest_timestamp
        ).on_conflict_replace().execute()

        return feed

    async def serve_from_cache(limit=10):
        """Return cached feed if recent and posts are fresh, otherwise None."""
        row = FeedCache.get_or_none(FeedCache.feed_uri == feed_uri)
        if row is None:
            return None

        age = time.time() - row.timestamp
        if age >= CACHE_TTL:
            return None  # Cache expired

        cached_feed = json.loads(row.response_json)
        feed_items = cached_feed.get("feed", [])
        if not feed_items:
            return None

        # Check if the oldest post in cache is within 48 hours using stored timestamp
        if row.oldest_timestamp is not None:
            if time.time() - row.oldest_timestamp > MAX_AGE_SECONDS:
                return None  # Cache has stale posts
        else:
            # Fallback: fetch the oldest post to check timestamp (for backwards compatibility)
            oldest_uri = feed_items[-1].get("post")
            if oldest_uri:
                oldest_full = await fetch_full_post(oldest_uri)
                if oldest_full:
                    created_at_str = oldest_full.get("record", {}).get("createdAt")
                    if created_at_str:
                        try:
                            oldest_time = datetime.fromisoformat(created_at_str.replace("Z", "+00:00")).timestamp()
                            now = datetime.now(timezone.utc).timestamp()
                            if now - oldest_time > MAX_AGE_SECONDS:
                                return None  # Cache has stale posts
                        except ValueError:
                            return None

        return cached_feed

    async def handler(cursor=None, limit=RESPONSE_LIMIT):
        # Normalize cursor to integer
        try:
            start = int(cursor)
        except (ValueError, TypeError):
            start = 0

        limit = int(limit)
        cached = await serve_from_cache()  # always check TTL

        if not cached:
            async with build_lock:
                # Double-check after acquiring lock
                cached = await serve_from_cache()
                if not cached:
                    cached = await build_feed(FEED_LIMIT)

        feed_items = cached.get("feed", [])

        # Slice the feed according to cursor + limit
        page = feed_items[start:start + limit]

        # Compute next cursor
        if start + limit >= len(feed_items):
            next_cursor = "0"  # must always be a string
        else:
            next_cursor = str(start + limit)

        return {
            "cursor": next_cursor,
            "feed": page,
        }

    return handler
