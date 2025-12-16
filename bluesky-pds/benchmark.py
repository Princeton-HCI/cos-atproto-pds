#!/usr/bin/env python3
import os
import json
import time
import statistics
import asyncio
import logging
from datetime import datetime

import numpy as np
import asyncpg
import websockets
import matplotlib.pyplot as plt
import pandas as pd
from dotenv import load_dotenv
import onnxruntime as ort
from transformers import AutoTokenizer

# -----------------------
# ENV / CONFIG
# -----------------------
load_dotenv()

DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

FIREHOSE_URL = (
    "wss://jetstream2.us-east.bsky.network/"
    "subscribe?wantedCollections=app.bsky.feed.post"
)

TRIALS = 10
FIREHOSE_WINDOW = 10          # seconds per trial
MAX_SAMPLE_WAIT = 60          # max seconds to collect sample posts
POST_SAMPLE_TARGET = 30       # posts used for embedding / DB benchmarks

# -----------------------
# LOGGING
# -----------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)
logger = logging.getLogger(__name__)

# -----------------------
# ONNX MODEL
# -----------------------
MODEL_PATH = os.path.join(
    os.path.dirname(__file__),
    "all-MiniLM-L6-v2.onnx"
)
TOKENIZER_NAME = "sentence-transformers/all-MiniLM-L6-v2"

tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
session = ort.InferenceSession(
    MODEL_PATH,
    providers=["CPUExecutionProvider"]
)

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
# DATABASE
# -----------------------
async def get_db():
    conn = await asyncpg.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        ssl="require"
    )
    await conn.execute("""
        CREATE TEMP TABLE temp_posts (
            repo TEXT,
            rkey TEXT,
            cid TEXT,
            text TEXT,
            created_at TIMESTAMP,
            embedding VECTOR(384),
            raw JSONB
        ) ON COMMIT PRESERVE ROWS;
    """)
    return conn

# -----------------------
# FIREHOSE SAMPLING
# -----------------------
async def collect_real_posts():
    posts = []
    start = time.perf_counter()

    async with websockets.connect(FIREHOSE_URL, ping_interval=20, ping_timeout=10) as ws:
        logger.info("Sampling real posts from firehose...")

        while len(posts) < POST_SAMPLE_TARGET:
            if time.perf_counter() - start > MAX_SAMPLE_WAIT:
                logger.warning(f"Sample timeout: collected {len(posts)} posts")
                break
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            evt = json.loads(msg)
            commit = evt.get("commit", {})
            if commit.get("collection") != "app.bsky.feed.post" or commit.get("operation") != "create":
                continue

            record = commit.get("record", {})
            text = extract_text(record)
            if not text:
                continue

            created_at = None
            created_at_str = record.get("createdAt")
            if created_at_str:
                dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                created_at = dt.replace(tzinfo=None)

            posts.append((
                evt.get("did"),
                commit.get("rkey"),
                commit.get("cid"),
                text,
                created_at,
                json.dumps(record)
            ))

            if len(posts) % 5 == 0:
                logger.info(f"Collected {len(posts)} posts")

    logger.info(f"Finished sampling ({len(posts)} posts)")
    return posts

async def benchmark_firehose_rate():
    counts = []
    async with websockets.connect(FIREHOSE_URL, ping_interval=20, ping_timeout=10) as ws:
        logger.info("Benchmarking firehose throughput...")
        for i in range(TRIALS):
            start = time.perf_counter()
            count = 0
            while time.perf_counter() - start < FIREHOSE_WINDOW:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                evt = json.loads(msg)
                commit = evt.get("commit", {})
                if commit.get("collection") == "app.bsky.feed.post" and commit.get("operation") == "create":
                    count += 1
            counts.append(count)
            logger.info(f"Trial {i+1}: {count} posts / {FIREHOSE_WINDOW}s")
    return counts

# -----------------------
# BENCHMARKS
# -----------------------
async def benchmark_embeddings(posts):
    times = []
    for post in posts:
        start = time.perf_counter()
        encode_onnx(post[3])
        times.append(time.perf_counter() - start)
    return times

async def benchmark_db_no_embedding(conn, posts):
    times = []
    for post in posts:
        start = time.perf_counter()
        await conn.execute("""
            INSERT INTO temp_posts
            (repo, rkey, cid, text, created_at, embedding, raw)
            VALUES ($1,$2,$3,$4,$5,NULL,$6)
        """, *post)
        times.append(time.perf_counter() - start)
    return times

async def benchmark_db_with_embedding(conn, posts):
    times = []
    for post in posts:
        emb = encode_onnx(post[3]).tolist()[0]
        start = time.perf_counter()
        await conn.execute("""
            INSERT INTO temp_posts
            (repo, rkey, cid, text, created_at, embedding, raw)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
        """, post[0], post[1], post[2], post[3], post[4], emb, post[5])
        times.append(time.perf_counter() - start)
    return times

# -----------------------
# PLOTTING
# -----------------------
def plot(results):
    df = pd.DataFrame(results)
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    df["embedding"].plot(ax=axes[0, 0], title="Embedding latency (s)")
    df["db_no_embed"].plot(ax=axes[0, 1], title="DB insert (no embedding)")
    df["db_with_embed"].plot(ax=axes[1, 0], title="DB insert (with embedding)")
    df["firehose"].plot(ax=axes[1, 1], title=f"Firehose posts / {FIREHOSE_WINDOW}s")
    for ax in axes.flat:
        ax.grid(True)
        ax.set_xlabel("Trial")
    plt.tight_layout()
    plt.savefig("real_firehose_benchmark.png")
    plt.show()

# -----------------------
# MAIN
# -----------------------
async def main():
    posts = await collect_real_posts()
    if not posts:
        logger.error("No posts collected — aborting benchmark.")
        return

    firehose = await benchmark_firehose_rate()
    conn = await get_db()

    embedding = await benchmark_embeddings(posts)
    db_no = await benchmark_db_no_embedding(conn, posts)
    db_yes = await benchmark_db_with_embedding(conn, posts)

    results = {
        "embedding": embedding,
        "db_no_embed": db_no,
        "db_with_embed": db_yes,
        "firehose": firehose
    }

    print("\n=== AVERAGES ===")
    for k, v in results.items():
        print(f"{k}: {statistics.mean(v):.4f}")

    plot(results)
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
