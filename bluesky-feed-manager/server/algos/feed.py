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
import math
import hashlib

SEARCH_CACHE_TTL = 30  # 30 seconds for search results
FEED_CACHE_TTL = 300  # 5 minutes for long-term feed cache
RESPONSE_LIMIT = 10 # number of posts to be received from api response
FEED_LIMIT = 100 # number of total posts in a feed
MAX_PER_AUTHOR = 10 # max posts per author in a feed
MAX_AGE_SECONDS = 48 * 60 * 60  # 48 hours in seconds

CUSTOM_API_URL = os.environ.get("CUSTOM_API_URL")

# ONNX model setup
MODEL_PATH = os.path.join(os.path.dirname(__file__), "all-MiniLM-L6-v2.onnx")
TOKENIZER_NAME = "sentence-transformers/all-MiniLM-L6-v2"

tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])

def compute_blueprint_hash(feed_uri: str) -> str:
    """Compute a deterministic hash of the feed blueprint (sources + ranking_weights)."""
    # Get all sources for this feed
    sources = (
        FeedSource
        .select()
        .join(Feed)
        .where(Feed.uri == feed_uri)
        .order_by(FeedSource.source_type, FeedSource.identifier)  # Ensure consistent ordering
    )
    
    # Build a deterministic representation of the blueprint
    blueprint_data = {
        "sources": [
            {
                "type": src.source_type,
                "identifier": src.identifier,
                "weight": src.weight
            }
            for src in sources
        ],
        "ranking_weights": get_ranking_weights(feed_uri)
    }
    
    # Convert to JSON string with sorted keys for consistency
    blueprint_json = json.dumps(blueprint_data, sort_keys=True)
    
    # Compute SHA256 hash
    return hashlib.sha256(blueprint_json.encode()).hexdigest()

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
        if r.source_type == "profile_filter":
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

def get_ranking_weights(feed_uri: str) -> dict:
    """Get ranking weights for a feed, with defaults."""
    try:
        feed = Feed.get(Feed.uri == feed_uri)
        if feed.ranking_weights:
            return json.loads(feed.ranking_weights)
    except:
        pass
    # Default weights (must sum to 1.0)
    return {"relevance": 0.5, "popularity": 0.3, "recency": 0.2}

def compute_relevance_score(full_post: dict, topic_preferences: list, profile_preferences: set) -> float:
    """Compute relevance score based on topic/profile match."""
    score = 0.0
    
    # Check if post is from a preferred profile
    author_did = full_post.get("author", {}).get("did")
    if author_did and author_did in profile_preferences:
        score += 1.0
    
    # Check topic relevance using simple text matching
    text = full_post.get("record", {}).get("text", "").lower()
    if text:
        for topic_pref in topic_preferences:
            topic_name = topic_pref["name"].lower()
            topic_weight = topic_pref["weight"]
            if topic_name in text:
                score += topic_weight
    
    return min(score, 1.0)  # Cap at 1.0

def compute_ranking_score(full_post: dict, post_time: float, now: float, 
                         ranking_weights: dict, topic_preferences: list, 
                         profile_preferences: set) -> float:
    """Compute composite ranking score based on relevance, popularity, and recency."""
    
    # Relevance score (0-1)
    relevance = compute_relevance_score(full_post, topic_preferences, profile_preferences)
    
    # Popularity score (0-1) - based on engagement metrics
    like_count = full_post.get("likeCount", 0)
    reply_count = full_post.get("replyCount", 0)
    repost_count = full_post.get("repostCount", 0)
    quote_count = full_post.get("quoteCount", 0)
    
    # Total engagement
    total_engagement = like_count + (reply_count * 2) + (repost_count * 3) + (quote_count * 2)
    # Normalize using log scale (caps around 1.0 for ~100+ engagements)
    popularity = min(math.log1p(total_engagement) / 5.0, 1.0)
    
    # Recency score (0-1) - exponential decay over 48 hours
    age_seconds = now - post_time
    recency = math.exp(-age_seconds / (MAX_AGE_SECONDS / 3))  # Decay over ~16 hours to 0.05
    recency = max(0.0, min(recency, 1.0))
    
    # Weighted combination
    w_relevance = ranking_weights.get("relevance", 0.5)
    w_popularity = ranking_weights.get("popularity", 0.5)
    w_recency = ranking_weights.get("recency", 0.5)
    
    # Normalize weights to sum to 1
    total_weight = w_relevance + w_popularity + w_recency
    if total_weight > 0:
        w_relevance /= total_weight
        w_popularity /= total_weight
        w_recency /= total_weight
    else:
        # If all weights are 0, use equal weighting
        w_relevance = w_popularity = w_recency = 1.0 / 3.0
    
    score = (relevance * w_relevance) + (popularity * w_popularity) + (recency * w_recency)
    
    return score

# Feed handler factory
def make_handler(feed_uri: str):
    build_lock = asyncio.Lock()  # Prevent concurrent builds for the same feed
    build_in_progress = False

    async def maybe_build_feed(force=False):
        nonlocal build_in_progress

        async with build_lock:
            if build_in_progress:
                return None
            build_in_progress = True

        try:
            return await build_feed(FEED_LIMIT)
        finally:
            async with build_lock:
                build_in_progress = False



    async def build_feed(limit=RESPONSE_LIMIT):
        """Build fresh feed skeleton by fetching sources + posts."""
        sources = (
            FeedSource
            .select()
            .join(Feed)
            .where(Feed.uri == feed_uri)
        )

        # Get ranking weights for this feed
        ranking_weights = get_ranking_weights(feed_uri)
        
        # Build lists for relevance computation
        topic_preferences = []
        profile_preferences = set()
        for src in sources:
            if src.source_type == "topic_preference":
                topic_preferences.append({"name": src.identifier, "weight": src.weight})
            elif src.source_type == "profile_preference":
                profile_preferences.add(src.identifier)

        # Load blacklist rules
        blocked_dids, banned_keywords = extract_filters(feed_uri)

        collected = []
        author_counts = defaultdict(int)

        # Fetch posts concurrently
        tasks = []
        seen_queries = set()
        for src in sources:
            if src.source_type == "profile_preference":
                tasks.append(fetch_author_posts(src.identifier, limit))
            elif src.source_type == "topic_preference":
                if src.identifier not in seen_queries:
                    # Check if this is an acronym
                    is_acronym = getattr(src, 'is_acronym', 0)
                    context = getattr(src, 'context', None)
                    
                    if is_acronym:
                        # For acronyms: ONLY use vector search, optionally with context
                        query = f"{context} {src.identifier}" if context else src.identifier
                        tasks.append(search_vector(query, limit))
                    else:
                        # For regular terms: use both text and vector search
                        tasks.append(search_text(src.identifier, limit))
                        tasks.append(search_vector(src.identifier, limit))
                    
                    seen_queries.add(src.identifier)
        results = await asyncio.gather(*tasks)

        for r in results:
            collected.extend(r)

        # Deduplicate collected posts before fetching full posts
        collected = list({p["uri"]: p for p in collected}.values())

        # Dynamically scale collection size based on MAX_PER_AUTHOR
        # Lower MAX_PER_AUTHOR = stricter filtering = need more posts
        collection_multiplier = max(2, 10 // MAX_PER_AUTHOR)
        target_collected = FEED_LIMIT * collection_multiplier
        if len(collected) > target_collected:
            collected = random.sample(collected, target_collected)

        # Fetch full posts with concurrency limit to avoid overwhelming API
        sem = asyncio.Semaphore(10)

        async def fetch_with_sem(uri):
            async with sem:
                return await fetch_full_post(uri)

        full_posts = await asyncio.gather(*[fetch_with_sem(p["uri"]) for p in collected])

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

            # Compute ranking score
            rank_score = compute_ranking_score(
                full_post, post_time, now, ranking_weights, 
                topic_preferences, profile_preferences
            )

            # Store full_post with URI, timestamp, and rank score for sorting
            filtered_posts.append({
                "uri": p["uri"],
                "timestamp": post_time,
                "rank_score": rank_score
            })

            if len(filtered_posts) >= FEED_LIMIT:
                break

        # Sort posts by ranking score (highest first), then by recency
        filtered_posts.sort(key=lambda x: (x["rank_score"], x["timestamp"]), reverse=True)

        # Compute oldest timestamp for cache validation
        oldest_timestamp = None
        if filtered_posts:
            oldest_timestamp = int(min(p["timestamp"] for p in filtered_posts))

        # Format for Bluesky
        feed = {
            "cursor": "0",
            "feed": [{"post": p["uri"]} for p in filtered_posts[:FEED_LIMIT]]
        }

        # Compute current blueprint hash
        current_blueprint_hash = compute_blueprint_hash(feed_uri)

        # Save to SQLite with blueprint hash
        FeedCache.insert(
            feed_uri=feed_uri,
            response_json=json.dumps(feed),
            timestamp=int(time.time()),
            oldest_timestamp=oldest_timestamp,
            blueprint_hash=current_blueprint_hash
        ).on_conflict_replace().execute()

        return feed

    async def serve_from_cache(limit=10):
        """Return cached feed if recent, blueprint matches, and posts are fresh, otherwise None."""
        row = FeedCache.get_or_none(FeedCache.feed_uri == feed_uri)
        if row is None:
            return None

        # Check if blueprint has changed - if so, invalidate cache
        current_blueprint_hash = compute_blueprint_hash(feed_uri)
        if row.blueprint_hash != current_blueprint_hash:
            print(f"Blueprint changed for {feed_uri}, invalidating cache")
            return None

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
        cached = await serve_from_cache()  # always check for any available cache

        if not cached:
            # No valid cache, rebuild immediately
            await maybe_build_feed(force=True)
            cached = await serve_from_cache()

        else:
            # Check if cache is over 5 minutes old, trigger background rebuild
            row = FeedCache.get_or_none(FeedCache.feed_uri == feed_uri)
            if row and (time.time() - row.timestamp) > FEED_CACHE_TTL:
                asyncio.create_task(maybe_build_feed())  # Background rebuild

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
