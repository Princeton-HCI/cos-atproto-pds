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
    """
    Embed a list of texts safely.
    - Handles empty strings
    - Prevents NaN / Inf vectors
    """
    if isinstance(texts, str):
        texts = [texts]

    # Ensure no None / empty-only strings
    texts = [t if t and t.strip() else "" for t in texts]

    inputs = TOKENIZER(
        texts,
        padding=True,
        truncation=True,
        return_tensors="np",
    )

    vecs = SESSION.run(None, dict(inputs))[0]

    # Safe normalization
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms = np.clip(norms, 1e-12, None)  # avoid divide-by-zero
    vecs = vecs / norms

    return vecs.tolist()

async def process_authors(pool, batch_size=32):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, display_name, handle, description, recent_posts
            FROM authors
            WHERE display_name_embedding IS NULL
            LIMIT $1
        """, batch_size)

        if not rows:
            return 0

        for r in rows:
            emb_display_name = embed(r["display_name"] or "")[0][0]
            emb_display_name_str = "[" + ",".join(map(str, emb_display_name)) + "]"
            emb_handle = embed(r["handle"] or "")[0][0]
            emb_handle_str = "[" + ",".join(map(str, emb_handle)) + "]"
            emb_description = embed(r["description"] or "")[0][0]
            emb_description_str = "[" + ",".join(map(str, emb_description)) + "]"
            emb_recent_posts = embed(r["recent_posts"] or "")[0][0]
            emb_recent_posts_str = "[" + ",".join(map(str, emb_recent_posts)) + "]"

            await conn.execute("""
                UPDATE authors
                SET display_name_embedding=$1,
                    handle_embedding=$2,
                    description_embedding=$3,
                    recent_posts_embedding=$4
                WHERE id=$5
            """, emb_display_name_str, emb_handle_str, emb_description_str, emb_recent_posts_str, r["id"])

        return len(rows)

async def main():
    pool = await asyncpg.create_pool(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        ssl="require",
    )

    logger.info("Author embedding worker started")

    while True:
        try:
            n = await process_authors(pool)
            if n == 0:
                await asyncio.sleep(2)
            else:
                logger.info(f"Embedded {n} authors")
        except Exception:
            logger.exception("Embedding loop error")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())
