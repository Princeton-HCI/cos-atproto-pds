import asyncio
import websockets
import json
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# Bluesky firehose endpoint
FIREHOSE_URL = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post"

OUTPUT_FILE = "output.jsonl"  # line-delimited JSON for easier inspection

async def main():
    async with websockets.connect(FIREHOSE_URL) as ws:
        logger.info("Connected to Bluesky firehose.")

        with open(OUTPUT_FILE, "w") as outfile:
            count = 0
            async for message in ws:
                logger.debug(f"Raw message: {message}")
                try:
                    evt = json.loads(message)
                    logger.debug(f"Event keys: {list(evt.keys())}")

                    commit = evt.get("commit", {})
                    collection = commit.get("collection")
                    logger.debug(f"Collection: {collection}")

                    if collection != "app.bsky.feed.post":
                        continue

                    repo = evt.get("did")
                    rkey = commit.get("rkey")
                    cid = commit.get("cid")
                    record = commit.get("record", {})

                    text = record.get("text")
                    created_at = record.get("createdAt")

                    row = {
                        "repo": repo,
                        "rkey": rkey,
                        "cid": cid,
                        "text": text,
                        "created_at": created_at,
                        "raw": record,
                    }

                    outfile.write(json.dumps(row) + "\n")
                    outfile.flush()

                    count += 1
                    logger.info(f"Wrote post #{count} from {repo}")

                    if count >= 20:
                        logger.info("Reached 20 posts. Exiting.")
                        break

                except Exception as e:
                    logger.error(f"Error processing message: {e}")

if __name__ == "__main__":
    asyncio.run(main())