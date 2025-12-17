import asyncio
import asyncpg
import aiohttp
import os
import json
from datetime import datetime, timezone
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
    recent_posts TEXT,
    followers_count INTEGER DEFAULT 0,
    follows_count INTEGER DEFAULT 0,
    posts_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP,
    display_name_embedding VECTOR(384),
    handle_embedding VECTOR(384),
    description_embedding VECTOR(384),
    recent_posts_embedding VECTOR(384)
);
"""

UPSERT_AUTHOR_SQL = """
INSERT INTO authors (
    id, handle, display_name, description,
    recent_posts, followers_count, follows_count, posts_count, updated_at,
    display_name_embedding, handle_embedding, description_embedding, recent_posts_embedding
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
ON CONFLICT (id) DO UPDATE
SET
    handle = EXCLUDED.handle,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    recent_posts = EXCLUDED.recent_posts,
    followers_count = EXCLUDED.followers_count,
    follows_count = EXCLUDED.follows_count,
    posts_count = EXCLUDED.posts_count,
    updated_at = GREATEST(authors.updated_at, EXCLUDED.updated_at),
    display_name_embedding = COALESCE(EXCLUDED.display_name_embedding, authors.display_name_embedding),
    handle_embedding = COALESCE(EXCLUDED.handle_embedding, authors.handle_embedding),
    description_embedding = COALESCE(EXCLUDED.description_embedding, authors.description_embedding),
    recent_posts_embedding = COALESCE(EXCLUDED.recent_posts_embedding, authors.recent_posts_embedding);
"""

async def init_db():
    conn = await asyncpg.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, database=DB_NAME, ssl="require"
    )
    await conn.execute(CREATE_AUTHORS_TABLE_SQL)
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS authors_display_name_embedding_idx
        ON authors USING ivfflat (display_name_embedding vector_l2_ops)
        WITH (lists = 200);
    """)
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS authors_handle_embedding_idx
        ON authors USING ivfflat (handle_embedding vector_l2_ops)
        WITH (lists = 200);
    """)
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS authors_description_embedding_idx
        ON authors USING ivfflat (description_embedding vector_l2_ops)
        WITH (lists = 200);
    """)
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS authors_recent_posts_embedding_idx
        ON authors USING ivfflat (recent_posts_embedding vector_l2_ops)
        WITH (lists = 200);
    """)
    await conn.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS authors_display_name_trgm_idx
        ON authors USING GIN (display_name gin_trgm_ops);
    """)
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS authors_handle_trgm_idx
        ON authors USING GIN (handle gin_trgm_ops);
    """)
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS authors_description_trgm_idx
        ON authors USING GIN (description gin_trgm_ops);
    """)
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS authors_recent_posts_trgm_idx
        ON authors USING GIN (recent_posts gin_trgm_ops);
    """)

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


async def process_author(pool, session, did):
    async with pool.acquire() as conn:  # separate connection per author
        profile = await fetch_profile(session, did)
        posts = await conn.fetch("""
            SELECT text, created_at FROM posts
            WHERE repo = $1
            ORDER BY created_at DESC
            LIMIT 500
        """, did)

        recent_posts = " ".join(p["text"] for p in posts)[:500]
        updated_at = max((p["created_at"] for p in posts), default=datetime.now(timezone.utc))

        await conn.execute(
            UPSERT_AUTHOR_SQL,
            did,
            profile.get("handle", did),
            profile.get("display_name", ""),
            profile.get("description", ""),
            recent_posts,
            profile.get("followers_count", 0),
            profile.get("follows_count", 0),
            profile.get("posts_count", 0),
            updated_at,
            None,
            None,
            None,
            None
        )

        await conn.execute(
            "UPDATE posts SET author_processed = TRUE WHERE repo = $1",
            did
        )
        logger.info(f"Processed author {did}")


async def build_authors(batch_size=50, concurrency=10):
    pool = await asyncpg.create_pool(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD,
        database=DB_NAME, ssl="require"
    )
    async with aiohttp.ClientSession() as http:
        while True:
            async with pool.acquire() as conn:
                rows = await conn.fetch(f"""
                    SELECT DISTINCT repo
                    FROM posts
                    WHERE author_processed = FALSE
                    LIMIT {batch_size}
                """)
            if not rows:
                await asyncio.sleep(5)
                continue

            dids = [r["repo"] for r in rows]
            sem = asyncio.Semaphore(concurrency)

            async def sem_task(did):
                async with sem:
                    await process_author(pool, http, did)

            tasks = [sem_task(did) for did in dids]
            await asyncio.gather(*tasks)

            await asyncio.sleep(1)  # small pause between batches


async def main():
    await init_db()
    await build_authors()


if __name__ == "__main__":
    asyncio.run(main())
