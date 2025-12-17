import asyncpg
import os
import numpy as np
from dotenv import load_dotenv
import onnxruntime as ort
from transformers import AutoTokenizer
import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

MODEL_PATH = "all-MiniLM-L6-v2.onnx"
TOKENIZER = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
SESSION = ort.InferenceSession(MODEL_PATH)

def embed(texts):
    if isinstance(texts, str):
        texts = [texts]
    inputs = TOKENIZER(texts, padding=True, truncation=True, return_tensors="np")
    vecs = SESSION.run(None, dict(inputs))[0]
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)
    return vecs.tolist()

async def process_posts(pool, batch_size=32):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, text FROM posts
            WHERE embedded = FALSE
            LIMIT $1
        """, batch_size)

        if not rows:
            return 0

        vectors = embed([r["text"] for r in rows])
        for r, v in zip(rows, vectors):
            await conn.execute(
                "UPDATE posts SET embedding=$1, embedded=TRUE WHERE id=$2",
                v, r["id"]
            )

        return len(rows)

async def main():
    pool = await asyncpg.create_pool(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        ssl="require",
        init=lambda c: c.set_type_codec(
            "vector",
            encoder=lambda v: "[" + ",".join(map(str, v)) + "]",
            schema="public",
            format="text",
        ),
    )

    while True:
        n = await process_posts(pool)
        if n == 0:
            await asyncio.sleep(2)
        else:
            logger.info(f"Embedded {n} posts")

if __name__ == "__main__":
    asyncio.run(main())
