import asyncio
import websockets
import json
import asyncpg
import os
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

FIREHOSE_URL = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post"

CREATE_POSTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    repo TEXT,
    rkey TEXT,
    cid TEXT,
    text TEXT,
    created_at TIMESTAMP,
    embedding VECTOR(384),
    raw JSONB,
    embedded BOOLEAN DEFAULT FALSE,
    author_processed BOOLEAN DEFAULT FALSE
);
"""

INSERT_POST_SQL = """
INSERT INTO posts (repo, rkey, cid, text, created_at, embedding, raw)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT DO NOTHING;
"""

async def init_db():
    conn = await asyncpg.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        ssl="require"
    )
    await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    await conn.execute(CREATE_POSTS_TABLE_SQL)
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS posts_created_at_idx
        ON posts (created_at);
    """)
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS posts_embedding_idx
        ON posts USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 1000);
    """)
    await conn.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS posts_text_trgm_idx
        ON posts USING GIN (text gin_trgm_ops);
    """)
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS posts_text_fts_idx
        ON posts USING GIN (to_tsvector('english', text));
    """)
    await conn.close()
    logger.info("Posts DB ready.")

def extract_text(record):
    text = record.get("text", "")
    alt_texts = []
    embed = record.get("embed", {})
    if embed.get("$type", "").startswith("app.bsky.embed.images"):
        for img in embed.get("images", []):
            if img.get("alt"):
                alt_texts.append(img["alt"])
    return (text + " " + " ".join(alt_texts)).strip()

async def handle_firehose():
    pool = await asyncpg.create_pool(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD,
        database=DB_NAME, ssl="require"
    )

    while True:
        try:
            async with websockets.connect(FIREHOSE_URL, ping_interval=20, ping_timeout=10) as ws:
                logger.info("Connected to Bluesky firehose")
                async for msg in ws:
                    evt = json.loads(msg)
                    commit = evt.get("commit", {})
                    if commit.get("collection") != "app.bsky.feed.post": continue
                    if commit.get("operation") != "create": continue

                    repo = evt["did"]
                    record = commit["record"]
                    text = extract_text(record)
                    created_at = datetime.fromisoformat(record["createdAt"].replace("Z","+00:00")).replace(tzinfo=None) if record.get("createdAt") else None

                    await pool.execute(
                        INSERT_POST_SQL,
                        repo,
                        commit["rkey"],
                        commit["cid"],
                        text,
                        created_at,
                        None,  # embedding not yet calculated
                        json.dumps(record)
                    )
        except Exception as e:
            logger.error("Firehose error", exc_info=True)
            await asyncio.sleep(5)

async def main():
    await init_db()
    await handle_firehose()

if __name__ == "__main__":
    asyncio.run(main())
