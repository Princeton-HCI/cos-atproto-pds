import asyncio
import asyncpg
import aiohttp
import os
import json
from datetime import datetime
from dotenv import load_dotenv
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

load_dotenv()

DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

CREATE_AUTHORS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS authors (
    id TEXT PRIMARY KEY,
    handle TEXT,
    display_name TEXT,
    description TEXT,
    posts_text TEXT,
    followers_count INTEGER DEFAULT 0,
    follows_count INTEGER DEFAULT 0,
    posts_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP
);
"""

UPSERT_AUTHOR_SQL = """
INSERT INTO authors (
    id, handle, display_name, description,
    followers_count, follows_count, posts_count, updated_at
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
ON CONFLICT (id) DO UPDATE
SET
    handle = EXCLUDED.handle,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    followers_count = EXCLUDED.followers_count,
    follows_count = EXCLUDED.follows_count,
    posts_count = EXCLUDED.posts_count,
    updated_at = GREATEST(authors.updated_at, EXCLUDED.updated_at);
"""

async def init_db():
    conn = await asyncpg.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, database=DB_NAME, ssl="require"
    )
    await conn.execute(CREATE_AUTHORS_TABLE_SQL)
    await conn.close()
    logger.info("Author DB ready.")

async def fetch_profile(session, did):
    url = f"https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={did}"
    try:
        async with session.get(url, timeout=10) as resp:
            if resp.status != 200:
                return {}
            data = await resp.json()
            return {
                "handle": data.get("handle", did),
                "display_name": data.get("displayName", ""),
                "description": data.get("description", ""),
                "followers_count": data.get("followersCount", 0),
                "follows_count": data.get("followsCount", 0),
                "posts_count": data.get("postsCount", 0),
            }
    except Exception as e:
        logger.warning(f"Profile fetch failed for {did}: {e}")
        return {}

async def build_authors():
    pool = await asyncpg.create_pool(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD,
        database=DB_NAME, ssl="require"
    )
    async with aiohttp.ClientSession() as http:
        while True:
            async with pool.acquire() as conn:
                # get posts whose authors haven't been processed
                rows = await conn.fetch("""
                    SELECT DISTINCT repo
                    FROM posts
                    WHERE author_processed = FALSE
                    LIMIT 100
                """)
                if not rows:
                    await asyncio.sleep(5)
                    continue

                for row in rows:
                    did = row["repo"]
                    profile = await fetch_profile(http, did)
                    # get latest posts for this author
                    posts = await conn.fetch("""
                        SELECT text, created_at FROM posts
                        WHERE repo = $1
                        ORDER BY created_at DESC
                        LIMIT 500
                    """, did)
                    posts_text = " ".join(p["text"] for p in posts)[:500]

                    updated_at = max(p["created_at"] for p in posts) if posts else datetime.utcnow()

                    await conn.execute(
                        UPSERT_AUTHOR_SQL,
                        did,
                        profile.get("handle", did),
                        profile.get("display_name", ""),
                        profile.get("description", ""),
                        profile.get("followers_count", 0),
                        profile.get("follows_count", 0),
                        profile.get("posts_count", 0),
                        updated_at,
                    )

                    # mark posts as processed
                    await conn.execute("""
                        UPDATE posts SET author_processed = TRUE
                        WHERE repo = $1
                    """, did)

            await asyncio.sleep(1)  # small pause between batches

async def main():
    await init_db()
    await build_authors()

if __name__ == "__main__":
    asyncio.run(main())
