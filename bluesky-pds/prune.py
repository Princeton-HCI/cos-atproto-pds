import asyncio
import asyncpg
import os
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# Constants
TABLE_NAME = "posts"
SIZE_LIMIT_BYTES = 6 * 1024 * 1024 * 1024  # 6GB
DELETE_BATCH_SIZE = 100
PRUNE_INTERVAL_SEC = 1

# Database configuration from environment variables
DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

# Assemble the database URL
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

async def get_table_size(conn):
    row = await conn.fetchrow("""
        SELECT pg_total_relation_size($1) AS size
    """, TABLE_NAME)
    return row["size"]

async def prune_oldest_rows(conn):
    logger.info("Pruning oldest rows...")
    result = await conn.execute(f"""
        DELETE FROM {TABLE_NAME}
        WHERE ctid IN (
            SELECT ctid FROM {TABLE_NAME}
            ORDER BY created_at ASC
            LIMIT {DELETE_BATCH_SIZE}
        )
    """)
    logger.info(f"Deleted rows: {result}")

async def run_pruner():
    conn = await asyncpg.connect(DATABASE_URL)
    logger.info("Pruner started. Monitoring table size...")

    try:
        while True:
            size = await get_table_size(conn)
            logger.info(f"Table size: {round(size / 1024 / 1024, 2)} MB")

            if size > SIZE_LIMIT_BYTES:
                await prune_oldest_rows(conn)
            await asyncio.sleep(PRUNE_INTERVAL_SEC)
    finally:
        await conn.close()
        logger.info("Pruner stopped and connection closed.")

if __name__ == "__main__":
    asyncio.run(run_pruner())