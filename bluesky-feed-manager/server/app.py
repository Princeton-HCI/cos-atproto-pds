import os
import logging

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

from server import config
from server.algos import algos
from server.algos.feed import make_handler
from server.create_feed import create_feed


# App setup
app = FastAPI()

# CORS configuration
allowed_origins = [
    "http://localhost:3000",
    "https://localhost:3000",

    "http://cos-atproto-pds.firebaseapp.com",
    "https://cos-atproto-pds.firebaseapp.com",
    "http://cos-atproto-pds.web.app",
    "https://cos-atproto-pds.web.app",

    "http://bonsai.princetonhci.social",
    "https://bonsai.princetonhci.social",
    "http://bonsai2.princetonhci.social",
    "https://bonsai2.princetonhci.social",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("API_KEY")
logging.basicConfig(level=logging.INFO)


# Routes
@app.get("/", response_class=HTMLResponse)
async def index():
    return """<pre>

     _____ _             _          _____           _    _____                         
    | __  | |_ _ ___ ___| |_ _ _   |   __|___ ___ _| |  |     |___ ___ ___ ___ ___ ___ 
    | __ -| | | | -_|_ -| '_| | |  |   __| -_| -_| . |  | | | | .'|   | .'| . | -_|  _|
    |_____|_|___|___|___|_,_|_  |  |__|  |___|___|___|  |_|_|_|__,|_|_|__,|_  |___|_|  
                            |___|                                         |___|        

    Bluesky Feed Generator
    https://github.com/Princeton-HCI/bluesky-feed-manager

    Princeton HCI - 2025
    </pre>"""

@app.get("/.well-known/did.json")
async def did_json():
    if not config.SERVICE_DID.endswith(config.HOSTNAME):
        raise HTTPException(status_code=404)
    return {
        "@context": ["https://www.w3.org/ns/did/v1"],
        "id": config.SERVICE_DID,
        "service": [
            {
                "id": "#bsky_fg",
                "type": "BskyFeedGenerator",
                "serviceEndpoint": f"https://{config.HOSTNAME}"
            }
        ]
    }

@app.get("/xrpc/app.bsky.feed.describeFeedGenerator")
async def describe_feed_generator():
    feeds = [{"uri": uri} for uri in algos.keys()]
    return {
        "encoding": "application/json",
        "body": {
            "did": config.SERVICE_DID,
            "feeds": feeds
        }
    }

@app.get("/xrpc/app.bsky.feed.getFeedSkeleton")
async def get_feed_skeleton(feed: str, cursor: str = None, limit: int = 20):
    algo = algos.get(feed)
    if not algo:
        raise HTTPException(status_code=400, detail="Unsupported algorithm")
    
    try:
        body = await algo(cursor, limit)
    except ValueError:
        raise HTTPException(status_code=400, detail="Malformed cursor")
    
    return body

@app.post("/manage-feed")
async def create_feed_endpoint(request: Request, data: dict):
    key = request.headers.get("x-api-key")
    if key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        # Create feed via ATProto API
        # These fields are the only ones recognized as parameters for create_feed()
        # You can extend as needed but must update in both places
        allowed_keys = ["handle","password","hostname","record_name","display_name","description","blueprint","ruleset_id","timestamp"]
        feed_data = {k: v for k, v in data.items() if k in allowed_keys}
        uri = create_feed(**feed_data)

        # Dynamically add handler for this new feed
        algos[uri] = make_handler(uri)
        logging.info("Feed and handler added for URI: %s", uri)

    except Exception as e:
        logging.error("Error in /manage-feed: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

    return {"uri": uri}
