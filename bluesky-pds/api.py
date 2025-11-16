from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from asyncpg import create_pool
import uvicorn
import os
from contextlib import asynccontextmanager
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# Database configuration from environment variables
DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up: creating DB connection pool...")
    app.state.pool = await create_pool(dsn=DATABASE_URL)
    yield
    logger.info("Shutting down: closing DB connection pool...")
    await app.state.pool.close()

app = FastAPI(lifespan=lifespan)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Text search endpoints
@app.get("/search/posts")
async def search_posts(q: str = Query(...)):
    """
    Search for posts by text (ILIKE).
    """
    logger.info(f"Received post search query: {q}")
    async with app.state.pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT * FROM posts
            WHERE text ILIKE $1
            ORDER BY created_at DESC
            LIMIT 50
            """,
            f"%{q}%",
        )
    return [dict(row) for row in rows]


@app.get("/search/authors")
async def search_authors(q: str = Query(...), use_embedding: bool = Query(False)):
    """
    Search for authors by display_name, handle, description, or posts_text.
    Ranking is primarily by fame (followers_count + posts_count).
    Optional: use_embedding=True will rank by embedding similarity first.
    """
    logger.info(f"Received author search query: {q} (use_embedding={use_embedding})")
    async with app.state.pool.acquire() as conn:
        if use_embedding:
            # Use embedding similarity if requested
            rows = await conn.fetch(
                """
                SELECT *,
                       1 - (posts_embedding <=> $1) AS similarity,
                       (followers_count + posts_count) AS fame_score
                FROM authors
                WHERE posts_embedding IS NOT NULL
                ORDER BY similarity DESC, fame_score DESC, updated_at DESC
                LIMIT 50
                """,
                f"[{','.join(map(str, q))}]" if isinstance(q, list) else f"%{q}%",
            )
        else:
            # Text-based search
            rows = await conn.fetch(
                """
                SELECT *,
                       (followers_count + posts_count) AS fame_score
                FROM authors
                WHERE
                    display_name ILIKE $1
                    OR handle ILIKE $1
                    OR description ILIKE $1
                    OR posts_text ILIKE $1
                ORDER BY fame_score DESC, updated_at DESC
                LIMIT 50
                """,
                f"%{q}%",
            )
    return [dict(row) for row in rows]

# Vector search endpoints
@app.post("/vector/search/posts")
async def vector_search_posts(vector: list[float]):
    """
    Find posts whose embeddings are most similar to the provided 384-dim vector.
    """
    if len(vector) != 384:
        return {"error": "Vector must be 384-dimensional."}

    vector_str = f"[{','.join(map(str, vector))}]"

    async with app.state.pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT *,
                   1 - (embedding <=> $1) AS similarity
            FROM posts
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> $1
            LIMIT 25
            """,
            vector_str,
        )

    return [dict(row) for row in rows]


@app.post("/vector/search/authors")
async def vector_search_authors(vector: list[float]):
    """
    Find authors whose posts_embedding are most similar to the provided 384-dim vector.
    """
    if len(vector) != 384:
        return {"error": "Vector must be 384-dimensional."}

    vector_str = f"[{','.join(map(str, vector))}]"

    async with app.state.pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT *,
                   1 - (posts_embedding <=> $1) AS similarity
            FROM authors
            WHERE posts_embedding IS NOT NULL
            ORDER BY posts_embedding <=> $1
            LIMIT 25
            """,
            vector_str,
        )

    return [dict(row) for row in rows]

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Cosine API online",
        "endpoints": [
            "/search/posts",
            "/search/authors",
            "/vector/search/posts",
            "/vector/search/authors"
        ]
    }


if __name__ == "__main__":
    logger.info("Starting API server...")
    uvicorn.run(app, host="0.0.0.0", port=8000)