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

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# Environment setup
load_dotenv()

DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

# ONNX model setup
MODEL_PATH = os.path.join(os.path.dirname(__file__), "all-MiniLM-L6-v2.onnx")
TOKENIZER_NAME = "sentence-transformers/all-MiniLM-L6-v2"

tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])

FIREHOSE_URL = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post"

# SQL Definitions
CREATE_POSTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    repo TEXT,
    rkey TEXT,
    cid TEXT,
    text TEXT,
    created_at TIMESTAMP,
    embedding VECTOR(384),
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
INSERT INTO posts (repo, rkey, cid, text, created_at, embedding, raw)
VALUES ($1, $2, $3, $4, $5, $6, $7);
"""

UPSERT_AUTHOR_SQL = """
INSERT INTO authors (
    id, handle, display_name, description, posts_text,
    display_name_embedding, handle_embedding, description_embedding, posts_embedding,
    followers_count, follows_count, posts_count, updated_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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


# Database initialization
async def init_db():
    """Connects to DB and ensures tables exist."""
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
    await conn.execute(CREATE_AUTHORS_TABLE_SQL)
    await conn.close()
    logger.info("Database initialized and tables ensured.")


# Helper functions
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

def extract_text(record):
    """Extract post text + alt text from embedded images."""
    text = record.get("text", "")
    alt_texts = []
    embed = record.get("embed", {})
    if embed.get("$type", "").startswith("app.bsky.embed.images"):
        for img in embed.get("images", []):
            alt = img.get("alt")
            if alt:
                alt_texts.append(alt)
    combined_text = text + " " + " ".join(alt_texts)
    return combined_text.strip()

async def fetch_profile(session, did):
    """Fetch profile info for a DID from Bluesky API."""
    url = f"https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={did}"
    try:
        async with session.get(url, timeout=10) as resp:
            if resp.status == 200:
                data = await resp.json()
                return {
                    "handle": data.get("handle"),
                    "display_name": data.get("displayName", ""),
                    "description": data.get("description", ""),
                    "followers_count": data.get("followersCount", 0),
                    "follows_count": data.get("followsCount", 0),
                    "posts_count": data.get("postsCount", 0),
                }
            else:
                logger.warning(f"Failed to fetch profile for {did}: {resp.status}")
                return None
    except Exception as e:
        logger.error(f"Error fetching profile for {did}: {e}")
        return None


# Firehose processing loop
async def handle_firehose():
    """Listen to firehose and store posts and authors."""
    db = await asyncpg.create_pool(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        ssl="require"
    )

    async with aiohttp.ClientSession() as session:
        while True:
            try:
                async with websockets.connect(FIREHOSE_URL, ping_interval=20, ping_timeout=10) as ws:
                    logger.info("Connected to Bluesky firehose.")

                    async for message in ws:
                        try:
                            evt = json.loads(message)
                            commit = evt.get("commit", {})
                            collection = commit.get("collection")
                            operation = commit.get("operation")

                            if collection != "app.bsky.feed.post" or operation != "create":
                                continue

                            repo = evt.get("did")
                            rkey = commit.get("rkey")
                            cid = commit.get("cid")
                            record = commit.get("record", {})
                            record_json = json.dumps(record)

                            # Combine text + alt texts
                            combined_text = extract_text(record)

                            # Parse creation time
                            created_at = None
                            created_at_str = record.get("createdAt")
                            if created_at_str:
                                dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                                created_at = dt.replace(tzinfo=None)

                            # Generate post embedding
                            post_embedding = encode_onnx(combined_text).tolist()
                            post_embedding_str = f"[{','.join(map(str, post_embedding[0]))}]"

                            # Insert post
                            await db.execute(
                                INSERT_POST_SQL,
                                repo, rkey, cid, combined_text, created_at, post_embedding_str, record_json
                            )
                            logger.info(f"Inserted post from {repo}")

                            # Check if author exists
                            existing_author = await db.fetchrow("SELECT id FROM authors WHERE id = $1", repo)
                            if not existing_author:
                                profile = await fetch_profile(session, repo) or {}
                                handle = profile.get("handle", repo)
                                display_name = profile.get("display_name", "")
                                description = profile.get("description", "")
                                followers_count = profile.get("followers_count", 0)
                                follows_count = profile.get("follows_count", 0)
                                posts_count = profile.get("posts_count", 0)

                                posts_text = combined_text[:500]
                                updated_at = created_at

                                # Embeddings
                                display_name_emb = encode_onnx(display_name).tolist()
                                handle_emb = encode_onnx(handle).tolist()
                                desc_emb = encode_onnx(description).tolist()
                                posts_emb = encode_onnx(posts_text).tolist()

                                display_name_emb_str = f"[{','.join(map(str, display_name_emb[0]))}]"
                                handle_emb_str = f"[{','.join(map(str, handle_emb[0]))}]"
                                desc_emb_str = f"[{','.join(map(str, desc_emb[0]))}]"
                                posts_emb_str = f"[{','.join(map(str, posts_emb[0]))}]"

                                await db.execute(
                                    UPSERT_AUTHOR_SQL,
                                    repo, handle, display_name, description, posts_text,
                                    display_name_emb_str, handle_emb_str, desc_emb_str, posts_emb_str,
                                    followers_count, follows_count, posts_count, updated_at
                                )
                                logger.info(f"Inserted new author {repo} ({handle}) with {followers_count} followers")
                            else:
                                # Update existing author’s recent posts
                                posts_text = combined_text[:500]
                                posts_emb = f"[{','.join(map(str, model.encode(posts_text).tolist()))}]"
                                await db.execute("""
                                    UPDATE authors
                                    SET posts_text = LEFT($1 || posts_text, 500),
                                        posts_embedding = $2,
                                        updated_at = GREATEST($3, updated_at)
                                    WHERE id = $4
                                """, posts_text, posts_emb, created_at, repo)
                                logger.info(f"Updated author {repo}")

                        except Exception as e:
                            logger.error(f"Error processing message: {e}", exc_info=True)

            except websockets.ConnectionClosedError as e:
                logger.warning(f"WebSocket closed: {e}. Reconnecting in 5s...")
                await asyncio.sleep(5)
            except Exception as e:
                logger.error(f"WebSocket error: {e}", exc_info=True)
                await asyncio.sleep(5)

# Entrypoint
async def main():
    await init_db()
    await handle_firehose()

if __name__ == "__main__":
    asyncio.run(main())