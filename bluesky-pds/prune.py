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

# Number of rows to delete weekly
DELETE_COUNT = int(os.getenv("PRUNE_DELETE_COUNT", "3000000"))

# How often to prune (seconds) - every week
PRUNE_INTERVAL_SEC = int(os.getenv("PRUNE_INTERVAL_SEC", str(7 * 24 * 3600)))

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
async def prune_oldest_rows(conn):
    logger.warning(
        f"Weekly prune — deleting {DELETE_COUNT:,} oldest posts"
    )

    result = await conn.execute(f"""
        DELETE FROM {TABLE_NAME}
        WHERE ctid IN (
            SELECT ctid
            FROM {TABLE_NAME}
            ORDER BY created_at ASC
            LIMIT {DELETE_COUNT}
        )
    """)

    logger.warning(f"Prune result: {result}")

# Main loop
async def run_pruner():
    conn = await asyncpg.connect(DATABASE_URL)
    logger.info("Pruner started")

    try:
        while True:
            logger.info("Starting weekly prune")
            await prune_oldest_rows(conn)
            logger.info(f"Sleeping for {PRUNE_INTERVAL_SEC} seconds ({PRUNE_INTERVAL_SEC / 3600 / 24:.1f} days)")
            await asyncio.sleep(PRUNE_INTERVAL_SEC)

    finally:
        await conn.close()
        logger.info("Pruner stopped")

if __name__ == "__main__":
    asyncio.run(run_pruner())