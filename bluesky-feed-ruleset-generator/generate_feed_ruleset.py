import os
import json
import datetime
import asyncio
import httpx
import numpy as np
import onnxruntime as ort
import openai
from transformers import AutoTokenizer

# Configuration
openai.api_key = os.getenv("OPENAI_API_KEY")
CUSTOM_API_URL = os.getenv("CUSTOM_API_URL")

# Load ONNX model setup
MODEL_PATH = os.path.join(os.path.dirname(__file__), "all-MiniLM-L6-v2.onnx")
TOKENIZER_NAME = "sentence-transformers/all-MiniLM-L6-v2"

tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])

def encode_onnx(texts):
    """Return normalized embedding vectors using ONNX model."""
    if isinstance(texts, str):
        texts = [texts]
    inputs = tokenizer(
        texts,
        padding=True,
        truncation=True,
        return_tensors="np",
    )
    outputs = session.run(None, dict(inputs))
    embeddings = outputs[0]
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1
    embeddings = embeddings / norms
    return embeddings

async def fetch_top_authors(query: str) -> list[str]:
    """Query the custom API for top authors using both text and embedding search."""
    suggested_dids = set()
    async with httpx.AsyncClient(timeout=30.0) as client:
        async def bluesky_search():
            url = "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors"
            params = {"q": query, "limit": 1}
            r = await client.get(url, params=params)
            if r.status_code == 200:
                data = r.json()
                for actor in data.get("actors", []):
                    did = actor.get("did")
                    if did:
                        suggested_dids.add(did)

        async def text_search():
            r = await client.get(f"{CUSTOM_API_URL}/search/authors", params={"q": query})
            if r.status_code == 200:
                for author in r.json()[:1]:
                    did = author.get("id") or author.get("did")
                    if did:
                        suggested_dids.add(did)

        async def vector_search():
            vector = encode_onnx(query).tolist()[0]
            body = json.dumps(vector)
            r = await client.post(
                f"{CUSTOM_API_URL}/vector/search/authors",
                content=body,
                headers={"Content-Type": "application/json"}
            )
            if r.status_code == 200:
                for author in r.json()[:1]:
                    did = author.get("id") or author.get("did")
                    if did:
                        suggested_dids.add(did)

        await asyncio.gather(bluesky_search(), text_search(), vector_search())

    return list(suggested_dids)

async def generate_feed_ruleset(query: str) -> dict:
    """Generates the feed ruleset JSON including suggested authors."""
    # LLM prompt
    llm_prompt = f"""
    The user described their ideal feed as follows:
    "{query}"

    Your task: produce ONLY valid JSON (no commentary or markdown).

    The JSON must contain the following top-level fields:

    {{
    "record_name": string,
    "display_name": string,
    "description": string,
    "topic_preferences": [
        {{ "name": string, "weight": float between 0.3 and 1.0 }}
    ],
    "topic_filters": [
        {{ "name": string, "weight": float (0.5 default) }}
    ],
    "ranking_weights": {{
        "relevance": float,
        "popularity": float,
        "recency": float
    }}
    }}

    Rules:
    - topic_preferences should represent meaningful subjects, entities, themes, or interests from the user's prompt. Keep to 5 topics, 1-2 words each.
    - topic_filters are topics or concepts the user wants to avoid or limit. Put these in topic_filters array.
    - Avoid generic action words unless actually thematic to the primary interests mentioned.
    - Display name must be less than 5 words.
    - record_name must be lowercase-with-hyphens, filesystem-safe, and contain no spaces.
    - ranking_weights MUST sum to exactly 1.0. Use defaults: relevance=0.5, popularity=0.3, recency=0.2 unless user specifies otherwise.
    - Output ONLY valid JSON.
    """

    response = openai.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[{"role": "user", "content": llm_prompt}],
        temperature=0.3
    )

    raw_text = response.choices[0].message.content.strip()
    try:
        feed_fields = json.loads(raw_text)
    except json.JSONDecodeError:
        raise ValueError("GPT did not return valid JSON:\n" + raw_text)

    # Add metadata
    feed_fields["original_prompt"] = query
    feed_fields["generated_at"] = datetime.datetime.utcnow().isoformat()

    # Normalize ranking_weights to ensure they sum to exactly 1.0
    if "ranking_weights" in feed_fields:
        weights = feed_fields["ranking_weights"]
        total = weights.get("relevance", 0.5) + weights.get("popularity", 0.3) + weights.get("recency", 0.2)
        if total > 0:
            weights["relevance"] = weights.get("relevance", 0.5) / total
            weights["popularity"] = weights.get("popularity", 0.3) / total
            weights["recency"] = weights.get("recency", 0.2) / total
    else:
        # Set defaults
        feed_fields["ranking_weights"] = {
            "relevance": 0.5,
            "popularity": 0.3,
            "recency": 0.2
        }

    # Fetch suggested accounts in parallel
    topic_queries = [t["name"] for t in feed_fields.get("topic_preferences", [])]
    results = await asyncio.gather(*(fetch_top_authors(q) for q in topic_queries))
    suggested_accounts = set(did for sublist in results for did in sublist)
    
    # Add profile_preferences with default weight
    if suggested_accounts:
        feed_fields["profile_preferences"] = [
            {"did": did, "weight": 0.5} for did in suggested_accounts
        ]

    # Remove name/description from blueprint
    blueprint = dict(feed_fields)
    blueprint.pop("record_name", None)
    blueprint.pop("display_name", None)
    blueprint.pop("description", None)

    # Final response
    final_output = {
        "record_name": feed_fields["record_name"],
        "display_name": feed_fields["display_name"],
        "description": feed_fields["description"],
        "blueprint": blueprint
    }

    return final_output

# Example usage
async def main():
    prompt = (
        "I want to see stuff about LeBron and updates on the crypto markets. "
        "I'd rather avoid political stuff though, and maybe some webcomic artists would be cool too."
    )
    result = await generate_feed_ruleset(query=prompt)
    print(json.dumps(result, indent=4))


if __name__ == "__main__":
    asyncio.run(main())
