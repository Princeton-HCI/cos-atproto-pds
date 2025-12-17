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

# Constants and configuration
TABLE_NAME = "posts"

# Threshold in GB (e.g. 10)
PRUNE_DB_THRESHOLD_GB = float(os.getenv("PRUNE_DB_THRESHOLD_GB", "10"))
SIZE_LIMIT_BYTES = int(PRUNE_DB_THRESHOLD_GB * 1024 * 1024 * 1024)

# Number of rows to delete when threshold exceeded
DELETE_BATCH_SIZE = int(os.getenv("PRUNE_DELETE_COUNT", "500000"))

# How often to check (seconds)
PRUNE_INTERVAL_SEC = int(os.getenv("PRUNE_INTERVAL_SEC", "10"))

# Database config
DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

# Assemble the database URL
DATABASE_URL = (
    f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# Helpers
async def get_table_size(conn) -> int:
    row = await conn.fetchrow(
        "SELECT pg_total_relation_size($1) AS size",
        TABLE_NAME,
    )
    return row["size"]

async def prune_oldest_rows(conn):
    logger.warning(
        f"Threshold exceeded — deleting {DELETE_BATCH_SIZE:,} oldest posts"
    )

    result = await conn.execute(f"""
        DELETE FROM {TABLE_NAME}
        WHERE ctid IN (
            SELECT ctid
            FROM {TABLE_NAME}
            ORDER BY created_at ASC
            LIMIT {DELETE_BATCH_SIZE}
        )
    """)

    logger.warning(f"Prune result: {result}")

# Main loop
async def run_pruner():
    conn = await asyncpg.connect(DATABASE_URL)
    logger.info("Pruner started")

    try:
        while True:
            size_bytes = await get_table_size(conn)
            size_gb = size_bytes / 1024 / 1024 / 1024

            logger.info(
                f"{TABLE_NAME} size: {size_gb:.2f} GB "
                f"(limit {PRUNE_DB_THRESHOLD_GB:.2f} GB)"
            )

            if size_bytes > SIZE_LIMIT_BYTES:
                await prune_oldest_rows(conn)

            await asyncio.sleep(PRUNE_INTERVAL_SEC)

    finally:
        await conn.close()
        logger.info("Pruner stopped")

if __name__ == "__main__":
    asyncio.run(run_pruner())