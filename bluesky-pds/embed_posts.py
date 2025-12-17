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

TOKENIZER = AutoTokenizer.from_pretrained(
    "sentence-transformers/all-MiniLM-L6-v2"
)
SESSION = ort.InferenceSession(MODEL_PATH)

def embed(texts):
    if isinstance(texts, str):
        texts = [texts]

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
    norms = np.clip(norms, 1e-12, None)
    vecs = vecs / norms

    return vecs.tolist()

async def process_posts(pool, batch_size=64):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, text
            FROM posts
            WHERE embedded = FALSE
              AND text IS NOT NULL
              AND length(trim(text)) > 0
            LIMIT $1
            """,
            batch_size,
        )

        if not rows:
            return 0

        vectors = embed([r["text"] for r in rows])

        for r, v in zip(rows, vectors):
            await conn.execute(
                """
                UPDATE posts
                SET embedding = $1,
                    embedded = TRUE
                WHERE id = $2
                """,
                v[0],
                r["id"],
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
        min_size=1,
        max_size=4,
        init=lambda c: c.set_type_codec(
            "vector",
            schema="public",
            format="text",
            encoder=lambda v: "[" + ",".join(map(str, v)) + "]",
            decoder=lambda v: [float(x) for x in v.strip("[]").split(",")],
        ),
    )

    logger.info("Post embedding worker started")

    while True:
        try:
            n = await process_posts(pool)
            if n == 0:
                await asyncio.sleep(2)
            else:
                logger.info(f"Embedded {n} posts")
        except Exception:
            logger.exception("Embedding loop error")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())
