# ingest.py
import asyncio
import websockets
import json
import asyncpg
import aiohttp
import os
from datetime import datetime
from dotenv import load_dotenv
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

FIREHOSE_URL = (
    "wss://jetstream2.us-east.bsky.network/subscribe"
    "?wantedCollections=app.bsky.feed.post"
)

CREATE_POST_SQL = """
INSERT INTO posts (repo, rkey, cid, text, created_at, raw)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT DO NOTHING;
"""

UPSERT_AUTHOR_SQL = """
INSERT INTO authors (
    id, handle, display_name, description,
    followers_count, follows_count, posts_count, updated_at
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
ON CONFLICT (id) DO UPDATE
SET
    handle = EXCLUDED.handle,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    followers_count = EXCLUDED.followers_count,
    follows_count = EXCLUDED.follows_count,
    posts_count = EXCLUDED.posts_count,
    updated_at = GREATEST(authors.updated_at, EXCLUDED.updated_at);
"""

def extract_text(record):
    text = record.get("text", "")
    embed = record.get("embed", {})
    alts = []

    if embed.get("$type", "").startswith("app.bsky.embed.images"):
        for img in embed.get("images", []):
            if img.get("alt"):
                alts.append(img["alt"])

    return (text + " " + " ".join(alts)).strip()

async def fetch_profile(session, did):
    url = f"https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={did}"
    async with session.get(url) as resp:
        if resp.status != 200:
            return {}
        data = await resp.json()
        return {
            "handle": data.get("handle", did),
            "display_name": data.get("displayName", ""),
            "description": data.get("description", ""),
            "followers_count": data.get("followersCount", 0),
            "follows_count": data.get("followsCount", 0),
            "posts_count": data.get("postsCount", 0),
        }

async def main():
    db = await asyncpg.create_pool(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        ssl="require",
    )

    async with aiohttp.ClientSession() as http:
        while True:
            try:
                async with websockets.connect(FIREHOSE_URL) as ws:
                    logger.info("Connected to firehose")

                    async for msg in ws:
                        evt = json.loads(msg)
                        commit = evt.get("commit", {})

                        if commit.get("collection") != "app.bsky.feed.post":
                            continue
                        if commit.get("operation") != "create":
                            continue

                        repo = evt["did"]
                        record = commit["record"]
                        text = extract_text(record)

                        created_at = None
                        if record.get("createdAt"):
                            created_at = datetime.fromisoformat(
                                record["createdAt"].replace("Z", "+00:00")
                            ).replace(tzinfo=None)

                        await db.execute(
                            CREATE_POST_SQL,
                            repo,
                            commit["rkey"],
                            commit["cid"],
                            text,
                            created_at,
                            json.dumps(record),
                        )

                        profile = await fetch_profile(http, repo)
                        await db.execute(
                            UPSERT_AUTHOR_SQL,
                            repo,
                            profile.get("handle", repo),
                            profile.get("display_name", ""),
                            profile.get("description", ""),
                            profile.get("followers_count", 0),
                            profile.get("follows_count", 0),
                            profile.get("posts_count", 0),
                            created_at,
                        )

            except Exception as e:
                logger.error("Firehose error", exc_info=True)
                await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())
