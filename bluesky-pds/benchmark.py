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
import matplotlib.pyplot as plt
import seaborn as sns

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

TRIALS = 10
TRIAL_DURATION = 30  # seconds per trial

# -----------------------
# ONNX Model
# -----------------------
tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])

def encode_onnx(texts):
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
# Firehose Trial
# -----------------------
async def run_trial(duration=30):
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

    start_time = time.perf_counter()
    ingestion_times = []
    embedding_times = []
    db_times = []

    async with websockets.connect(FIREHOSE_URL, ping_interval=20, ping_timeout=10) as ws:
        async for message in ws:
            now = time.perf_counter()
            if now - start_time > duration:
                break

            # Ingestion
            t0 = time.perf_counter()
            evt = json.loads(message)
            t1 = time.perf_counter()
            ingestion_times.append(t1 - t0)

            commit = evt.get("commit", {})
            if commit.get("collection") != "app.bsky.feed.post" or commit.get("operation") != "create":
                continue

            repo = evt.get("did")
            rkey = commit.get("rkey")
            cid = commit.get("cid")
            record = commit.get("record", {})
            record_json = json.dumps(record)
            combined_text = extract_text(record)

            # Embedding
            t2 = time.perf_counter()
            post_embedding = encode_onnx(combined_text).tolist()[0][0]
            t3 = time.perf_counter()
            embedding_times.append(t3 - t2)

            # DB insert
            created_at = None
            created_at_str = record.get("createdAt")
            if created_at_str:
                dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                created_at = dt.replace(tzinfo=None)
            t4 = time.perf_counter()
            await db.execute(
                INSERT_POST_SQL,
                repo, rkey, cid, combined_text, created_at, post_embedding, record_json
            )
            t5 = time.perf_counter()
            db_times.append(t5 - t4)

    await db.close()
    return ingestion_times, embedding_times, db_times

# -----------------------
# Benchmark Loop
# -----------------------
async def main():
    await init_db()

    all_ingest = []
    all_embed = []
    all_db = []

    for trial in range(TRIALS):
        logger.info(f"Starting trial {trial+1}/{TRIALS}...")
        ingest, embed, db_times = await run_trial(duration=TRIAL_DURATION)
        all_ingest.append(ingest)
        all_embed.append(embed)
        all_db.append(db_times)

    # Convert to flat arrays for plotting
    ingest_flat = np.concatenate(all_ingest)
    embed_flat = np.concatenate(all_embed)
    db_flat = np.concatenate(all_db)

    # Line plots
    plt.figure(figsize=(14, 6))
    plt.plot(ingest_flat, label="Ingestion Time (s)")
    plt.plot(embed_flat, label="Embedding Time (s)")
    plt.plot(db_flat, label="DB Insert Time (s)")
    plt.xlabel("Post Index")
    plt.ylabel("Time (s)")
    plt.title("Post Processing Times Over Trials")
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    plt.savefig("line_plot_times.png")
    plt.show()

    # Bell curves / rates (posts per second)
    ingest_rate = 1 / np.array(ingest_flat)
    embed_rate = 1 / np.array(embed_flat)
    db_rate = 1 / np.array(db_flat)

    plt.figure(figsize=(14, 6))
    sns.kdeplot(ingest_rate, fill=True, label="Ingestion Rate (posts/sec)")
    sns.kdeplot(embed_rate, fill=True, label="Embedding Rate (posts/sec)")
    sns.kdeplot(db_rate, fill=True, label="DB Insert Rate (posts/sec)")
    plt.xlabel("Posts per Second")
    plt.ylabel("Density")
    plt.title("Post Processing Rates (Bell Curves)")
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    plt.savefig("bell_curves_rates.png")
    plt.show()

if __name__ == "__main__":
    asyncio.run(main())
