#!/usr/bin/env python3
import asyncio
import websockets
import aiohttp
import asyncpg
import json
import os
import time
import numpy as np
from datetime import datetime
from dotenv import load_dotenv
import onnxruntime as ort
from transformers import AutoTokenizer
import logging

# -----------------------
# Logging
# -----------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)
logger = logging.getLogger(__name__)

# -----------------------
# Environment / Config
# -----------------------
load_dotenv()

DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

FIREHOSE_URL = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post"

MODEL_PATH = os.path.join(os.path.dirname(__file__), "all-MiniLM-L6-v2.onnx")
TOKENIZER_NAME = "sentence-transformers/all-MiniLM-L6-v2"

# -----------------------
# ONNX Model
# -----------------------
tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])

def encode_onnx(texts):
    """Return normalized embeddings from ONNX model."""
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

# -----------------------
# SQL
# -----------------------
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

INSERT_POST_SQL = """
INSERT INTO posts (repo, rkey, cid, text, created_at, embedding, raw)
VALUES ($1, $2, $3, $4, $5, $6, $7);
"""

# -----------------------
# Database Init
# -----------------------
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
    await conn.close()
    logger.info("Database initialized and tables ensured.")

# -----------------------
# Benchmark Firehose
# -----------------------
async def handle_firehose(num_posts: int = 30):
    """Listen to firehose, insert posts, and measure timings."""
    db = await asyncpg.create_pool(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        ssl="require",
        init=lambda conn: conn.set_type_codec(
            'vector',
            encoder=lambda v: "[" + ",".join(map(str, v)) + "]",
            decoder=json.loads,
            schema='public',
            format='text'
        )
    )

    collect_times = []
    embedding_times = []
    db_times = []
    post_count = 0

    async with websockets.connect(FIREHOSE_URL, ping_interval=20, ping_timeout=10) as ws:
        logger.info("Connected to Bluesky firehose.")

        async for message in ws:
            if post_count >= num_posts:
                break

            # Timing: ingestion
            start_collect = time.perf_counter()
            evt = json.loads(message)
            end_collect = time.perf_counter()
            collect_times.append(end_collect - start_collect)

            commit = evt.get("commit", {})
            if commit.get("collection") != "app.bsky.feed.post" or commit.get("operation") != "create":
                continue

            repo = evt.get("did")
            rkey = commit.get("rkey")
            cid = commit.get("cid")
            record = commit.get("record", {})
            record_json = json.dumps(record)

            combined_text = extract_text(record)

            # Timing: embedding
            start_embed = time.perf_counter()
            post_embedding = encode_onnx(combined_text).tolist()[0][0]
            end_embed = time.perf_counter()
            embedding_times.append(end_embed - start_embed)

            # Parse creation time
            created_at = None
            created_at_str = record.get("createdAt")
            if created_at_str:
                dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                created_at = dt.replace(tzinfo=None)

            # Timing: DB insertion
            start_db = time.perf_counter()
            await db.execute(
                INSERT_POST_SQL,
                repo, rkey, cid, combined_text, created_at, post_embedding, record_json
            )
            end_db = time.perf_counter()
            db_times.append(end_db - start_db)

            post_count += 1
            logger.info(
                f"Post {post_count}/{num_posts} processed — "
                f"collect: {collect_times[-1]:.4f}s, "
                f"embed: {embedding_times[-1]:.4f}s, "
                f"db: {db_times[-1]:.4f}s"
            )

    # Summary
    logger.info("\n=== TIMING SUMMARY ===")
    logger.info(f"Avg collect time: {np.mean(collect_times):.4f}s")
    logger.info(f"Avg embedding time: {np.mean(embedding_times):.4f}s")
    logger.info(f"Avg DB insert time: {np.mean(db_times):.4f}s")

    await db.close()

# -----------------------
# Main
# -----------------------
async def main():
    await init_db()
    await handle_firehose(num_posts=30)  # adjust sample size here

if __name__ == "__main__":
    asyncio.run(main())
