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

async def process_authors(pool, batch_size=16):
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
            emb_display_name = embed(r["display_name"] or [""])[0][0]
            emb_handle = embed(r["handle"] or [""])[0][0]
            emb_description = embed(r["description"] or [""])[0][0]
            emb_recent_posts = embed(r["recent_posts"] or [""])[0][0]

            await conn.execute("""
                UPDATE authors
                SET display_name_embedding=$1,
                    handle_embedding=$2,
                    description_embedding=$3,
                    recent_posts_embedding=$4
                WHERE id=$5
            """, emb_display_name, emb_handle, emb_description, emb_recent_posts, r["id"])

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
        n = await process_authors(pool)
        if n == 0:
            await asyncio.sleep(5)
        else:
            logger.info(f"Embedded {n} authors")

if __name__ == "__main__":
    asyncio.run(main())
