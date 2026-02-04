import asyncio
import asyncpg
import os
import logging
import shutil

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# Constants and configuration
TABLE_NAME = "posts"

# Disk usage threshold to trigger pruning (75%)
DISK_THRESHOLD_PERCENT = float(os.getenv("DISK_THRESHOLD_PERCENT", "75.0"))

# Check disk usage every 30 minutes
CHECK_INTERVAL_SEC = int(os.getenv("CHECK_INTERVAL_SEC", str(30 * 60)))

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
def get_disk_usage():
    """Get disk usage percentage for root filesystem"""
    usage = shutil.disk_usage("/")
    percent = (usage.used / usage.total) * 100
    return percent

async def get_post_count(conn):
    """Get total number of posts"""
    result = await conn.fetchval(f"SELECT COUNT(*) FROM {TABLE_NAME}")
    return result

async def prune_oldest_posts(conn, delete_count):
    """Delete oldest posts"""
    logger.warning(f"Disk threshold exceeded — deleting {delete_count:,} oldest posts")

    result = await conn.execute(f"""
        DELETE FROM {TABLE_NAME}
        WHERE ctid IN (
            SELECT ctid
            FROM {TABLE_NAME}
            ORDER BY created_at ASC
            LIMIT {delete_count}
        )
    """)

    logger.warning(f"Prune result: {result}")
    
    # Run VACUUM to reclaim space
    logger.info("Running VACUUM to reclaim disk space...")
    await conn.execute("VACUUM ANALYZE posts")
    logger.info("VACUUM completed")

# Main loop
async def run_pruner():
    conn = await asyncpg.connect(DATABASE_URL)
    logger.info(f"Pruner started - monitoring disk usage every {CHECK_INTERVAL_SEC}s")
    logger.info(f"Will delete 50% of oldest posts when disk usage exceeds {DISK_THRESHOLD_PERCENT}%")

    try:
        while True:
            # Check disk usage
            disk_usage = get_disk_usage()
            logger.info(f"Disk usage: {disk_usage:.1f}%")
            
            if disk_usage >= DISK_THRESHOLD_PERCENT:
                logger.warning(f"Disk usage ({disk_usage:.1f}%) exceeds threshold ({DISK_THRESHOLD_PERCENT}%)")
                
                # Get total post count
                total_posts = await get_post_count(conn)
                logger.info(f"Total posts in database: {total_posts:,}")
                
                # Delete 50% of oldest posts
                delete_count = total_posts // 2
                if delete_count > 0:
                    await prune_oldest_posts(conn, delete_count)
                    
                    # Check disk usage again
                    new_disk_usage = get_disk_usage()
                    logger.info(f"Disk usage after prune: {new_disk_usage:.1f}%")
                else:
                    logger.warning("No posts to delete")
            
            logger.info(f"Sleeping for {CHECK_INTERVAL_SEC} seconds ({CHECK_INTERVAL_SEC / 60:.0f} minutes)")
            await asyncio.sleep(CHECK_INTERVAL_SEC)

    finally:
        await conn.close()
        logger.info("Pruner stopped")

if __name__ == "__main__":
    asyncio.run(run_pruner())