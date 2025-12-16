import asyncio
import websockets
import json
import asyncpg
import aiohttp
import os
from datetime import datetime
from dotenv import load_dotenv
import logging

# --------------------------------------------------
# Logging
# --------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# --------------------------------------------------
# Environment
# --------------------------------------------------
load_dotenv()

DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

FIREHOSE_URL = (
    "wss://jetstream2.us-east.bsky.network/subscribe"
    "?wantedCollections=app.bsky.feed.post"
)

# --------------------------------------------------
# SQL — schema (NO embeddings required)
# --------------------------------------------------

CREATE_POSTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    repo TEXT,
    rkey TEXT,
    cid TEXT,
    text TEXT,
    created_at TIMESTAMP,
    embedding VECTOR(384),
    embedded BOOLEAN DEFAULT FALSE,
    raw JSONB
);
"""

CREATE_AUTHORS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS authors (
    id TEXT PRIMARY KEY,
    handle TEXT,
    display_name TEXT,
    description TEXT,
    posts_text TEXT,
    display_name_embedding VECTOR(384),
    handle_embedding VECTOR(384),
    description_embedding VECTOR(384),
    posts_embedding VECTOR(384),
    followers_count INTEGER DEFAULT 0,
    follows_count INTEGER DEFAULT 0,
    posts_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP
);
"""

INSERT_POST_SQL = """
INSERT INTO posts (repo, rkey, cid, text, created_at, raw)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT DO NOTHING;
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

# --------------------------------------------------
# DB initialization (robust & idempotent)
# --------------------------------------------------

async def init_db():
    conn = await asyncpg.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        ssl="require",
    )

    logger.info("Initializing database schema...")

    # pgvector
    await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # tables
    await conn.execute(CREATE_POSTS_TABLE_SQL)
    await conn.execute(CREATE_AUTHORS_TABLE_SQL)

    # schema drift protection
    await conn.execute("""
        ALTER TABLE posts
        ADD COLUMN IF NOT EXISTS embedded BOOLEAN DEFAULT FALSE;
    """)

    await conn.close()
    logger.info("Database ready.")

# --------------------------------------------------
# Helpers
# --------------------------------------------------

def extract_text(record):
    text = record.get("text", "")
    alt_texts = []

    embed = record.get("embed", {})
    if embed.get("$type", "").startswith("app.bsky.embed.images"):
        for img in embed.get("images", []):
            if img.get("alt"):
                alt_texts.append(img["alt"])

    return (text + " " + " ".join(alt_texts)).strip()

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

# --------------------------------------------------
# Firehose loop
# --------------------------------------------------

async def handle_firehose():
    pool = await asyncpg.create_pool(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        ssl="require",
    )

    async with aiohttp.ClientSession() as http:
        while True:
            try:
                async with websockets.connect(
                    FIREHOSE_URL,
                    ping_interval=20,
                    ping_timeout=10,
                ) as ws:
                    logger.info("Connected to Bluesky firehose")

                    async for msg in ws:
                        evt = json.loads(msg)
                        commit = evt.get("commit", {})

                        if commit.get("collection") != "app.bsky.feed.post":
                            continue
                        if commit.get("operation") != "create":
                            continue

                        repo = evt["did"]
                        record = commit["record"]
                        text = extract_text(record)

                        created_at = None
                        if record.get("createdAt"):
                            created_at = datetime.fromisoformat(
                                record["createdAt"].replace("Z", "+00:00")
                            ).replace(tzinfo=None)

                        await pool.execute(
                            INSERT_POST_SQL,
                            repo,
                            commit["rkey"],
                            commit["cid"],
                            text,
                            created_at,
                            json.dumps(record),
                        )

                        profile = await fetch_profile(http, repo)

                        await pool.execute(
                            UPSERT_AUTHOR_SQL,
                            repo,
                            profile.get("handle", repo),
                            profile.get("display_name", ""),
                            profile.get("description", ""),
                            profile.get("followers_count", 0),
                            profile.get("follows_count", 0),
                            profile.get("posts_count", 0),
                            created_at,
                        )

            except Exception as e:
                logger.error("Firehose error", exc_info=True)
                await asyncio.sleep(5)

# --------------------------------------------------
# Entrypoint
# --------------------------------------------------

async def main():
    await init_db()
    await handle_firehose()

if __name__ == "__main__":
    asyncio.run(main())
