import asyncio
import websockets
import json
import asyncpg
import aiohttp
import os
import numpy as np
from datetime import datetime
from dotenv import load_dotenv
import onnxruntime as ort
from transformers import AutoTokenizer
import logging

# ------------------------------------------------------------------------------
# Logging
# ------------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# Environment
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# ONNX model
# ------------------------------------------------------------------------------
MODEL_PATH = os.path.join(os.path.dirname(__file__), "all-MiniLM-L6-v2.onnx")
TOKENIZER_NAME = "sentence-transformers/all-MiniLM-L6-v2"

tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])

# ------------------------------------------------------------------------------
# SQL
# ------------------------------------------------------------------------------
CREATE_POSTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    repo TEXT NOT NULL,
    rkey TEXT NOT NULL,
    cid TEXT,
    text TEXT,
    created_at TIMESTAMP,
    embedding VECTOR(384),
    raw JSONB
);
"""

CREATE_POSTS_INDEX_SQL = """
CREATE UNIQUE INDEX IF NOT EXISTS posts_repo_rkey_idx
ON posts (repo, rkey);
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
INSERT INTO posts (repo, rkey, cid, text, created_at, embedding, raw)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (repo, rkey) DO NOTHING;
"""

UPSERT_AUTHOR_SQL = """
INSERT INTO authors (
    id, handle, display_name, description, posts_text,
    display_name_embedding, handle_embedding,
    description_embedding, posts_embedding,
    followers_count, follows_count, posts_count, updated_at
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
ON CONFLICT (id) DO UPDATE
SET
    handle = EXCLUDED.handle,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    posts_text = LEFT(EXCLUDED.posts_text || authors.posts_text, 500),
    display_name_embedding = EXCLUDED.display_name_embedding,
    handle_embedding = EXCLUDED.handle_embedding,
    description_embedding = EXCLUDED.description_embedding,
    posts_embedding = EXCLUDED.posts_embedding,
    followers_count = EXCLUDED.followers_count,
    follows_count = EXCLUDED.follows_count,
    posts_count = EXCLUDED.posts_count,
    updated_at = GREATEST(EXCLUDED.updated_at, authors.updated_at);
"""

# ------------------------------------------------------------------------------
# DB bootstrap / safety
# ------------------------------------------------------------------------------
async def ensure_schema(conn):
    await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    await conn.execute(CREATE_POSTS_TABLE_SQL)
    await conn.execute(CREATE_POSTS_INDEX_SQL)
    await conn.execute(CREATE_AUTHORS_TABLE_SQL)


async def init_db():
    for attempt in range(5):
        try:
            conn = await asyncpg.connect(
                host=DB_HOST,
                port=DB_PORT,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME,
                ssl="require",
            )
            await ensure_schema(conn)
            await conn.close()
            logger.info("Database schema ensured.")
            return
        except Exception as e:
            logger.warning(f"DB init failed (attempt {attempt+1}/5): {e}")
            await asyncio.sleep(2)

    raise RuntimeError("Could not initialize database")


async def pool_init(conn):
    await ensure_schema(conn)
    await conn.set_type_codec(
        "vector",
        encoder=lambda v: "[" + ",".join(map(str, v)) + "]",
        decoder=json.loads,
        schema="public",
        format="text",
    )

# ------------------------------------------------------------------------------
# Embeddings
# ------------------------------------------------------------------------------
def encode_onnx(texts):
    if isinstance(texts, str):
        texts = [texts]
    inputs = tokenizer(texts, padding=True, truncation=True, return_tensors="np")
    outputs = session.run(None, dict(inputs))
    emb = outputs[0]
    norm = np.linalg.norm(emb, axis=1, keepdims=True)
    norm[norm == 0] = 1
    return emb / norm


def extract_text(record):
    text = record.get("text", "")
    alts = []
    embed = record.get("embed", {})
    if embed.get("$type", "").startswith("app.bsky.embed.images"):
        for img in embed.get("images", []):
            if img.get("alt"):
                alts.append(img["alt"])
    return (text + " " + " ".join(alts)).strip()


async def fetch_profile(session, did):
    url = (
        "https://public.api.bsky.app/xrpc/"
        f"app.bsky.actor.getProfile?actor={did}"
    )
    try:
        async with session.get(url, timeout=10) as resp:
            if resp.status != 200:
                return None
            data = await resp.json()
            return {
                "handle": data.get("handle"),
                "display_name": data.get("displayName", ""),
                "description": data.get("description", ""),
                "followers_count": data.get("followersCount", 0),
                "follows_count": data.get("followsCount", 0),
                "posts_count": data.get("postsCount", 0),
            }
    except Exception as e:
        logger.warning(f"Profile fetch failed for {did}: {e}")
        return None

# ------------------------------------------------------------------------------
# Firehose
# ------------------------------------------------------------------------------
async def handle_firehose():
    db = await asyncpg.create_pool(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        ssl="require",
        init=pool_init,
        min_size=1,
        max_size=5,
    )

    async with aiohttp.ClientSession() as http:
        while True:
            try:
                async with websockets.connect(
                    FIREHOSE_URL, ping_interval=20, ping_timeout=10
                ) as ws:
                    logger.info("Connected to Bluesky firehose")

                    async for msg in ws:
                        try:
                            evt = json.loads(msg)
                            commit = evt.get("commit", {})
                            if (
                                commit.get("collection") != "app.bsky.feed.post"
                                or commit.get("operation") != "create"
                            ):
                                continue

                            repo = evt.get("did")
                            rkey = commit.get("rkey")
                            cid = commit.get("cid")
                            record = commit.get("record", {})
                            raw = json.dumps(record)

                            text = extract_text(record)

                            created_at = None
                            if record.get("createdAt"):
                                created_at = datetime.fromisoformat(
                                    record["createdAt"].replace("Z", "+00:00")
                                ).replace(tzinfo=None)
                            updated_at = created_at or datetime.utcnow()

                            post_emb = encode_onnx(text).tolist()[0]

                            async with db.acquire() as conn:
                                await conn.execute(
                                    INSERT_POST_SQL,
                                    repo, rkey, cid, text, created_at, post_emb, raw
                                )

                                exists = await conn.fetchval(
                                    "SELECT 1 FROM authors WHERE id=$1", repo
                                )

                                if not exists:
                                    profile = await fetch_profile(http, repo) or {}
                                    handle = profile.get("handle", repo)
                                    display = profile.get("display_name", "")
                                    desc = profile.get("description", "")
                                    followers = profile.get("followers_count", 0)
                                    follows = profile.get("follows_count", 0)
                                    posts_cnt = profile.get("posts_count", 0)

                                    posts_text = text[:500]

                                    await conn.execute(
                                        UPSERT_AUTHOR_SQL,
                                        repo,
                                        handle,
                                        display,
                                        desc,
                                        posts_text,
                                        encode_onnx(display).tolist()[0],
                                        encode_onnx(handle).tolist()[0],
                                        encode_onnx(desc).tolist()[0],
                                        encode_onnx(posts_text).tolist()[0],
                                        followers,
                                        follows,
                                        posts_cnt,
                                        updated_at,
                                    )
                                else:
                                    await conn.execute(
                                        """
                                        UPDATE authors
                                        SET posts_text = LEFT($1 || posts_text, 500),
                                            posts_embedding = $2,
                                            updated_at = GREATEST($3, updated_at)
                                        WHERE id = $4
                                        """,
                                        text[:500],
                                        encode_onnx(text).tolist()[0],
                                        updated_at,
                                        repo,
                                    )

                        except asyncpg.UndefinedTableError:
                            logger.warning("Schema missing, reinitializing")
                            async with db.acquire() as conn:
                                await ensure_schema(conn)
                        except Exception as e:
                            logger.error("Event processing error", exc_info=e)

            except Exception as e:
                logger.warning(f"Firehose disconnected: {e}")
                await asyncio.sleep(5)

# ------------------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------------------
async def main():
    await init_db()
    await handle_firehose()


if __name__ == "__main__":
    asyncio.run(main())
