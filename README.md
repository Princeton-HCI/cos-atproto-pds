# cos-atproto-pds

This repository contains a comprehensive suite of interconnected services for building, deploying, and managing **custom Bluesky feeds** powered by AI and semantic search. The system combines data ingestion, natural language processing, vector embeddings, and dynamic feed generation to create personalized, intelligent content feeds on the Bluesky/ATProto network.

---

## System Architecture Overview

The system consists of four major components that work together in a pipeline:

1. **bluesky-pds** — Data ingestion and search infrastructure
2. **bluesky-feed-ruleset-generator** — AI-powered feed blueprint generation
3. **bluesky-feed-manager** — Feed deployment and runtime management
4. **bonsai2** — User interface for feed creation

---

## Projects Overview

### 1. 📘 **bluesky-pds** — Personal Data Server with Embeddings

**Purpose:** Core data infrastructure that powers the entire feed ecosystem with real-time content ingestion, semantic embeddings, and intelligent search capabilities.

**Technical Details:**

- **Firehose Ingestion:** Connects to the ATProto Jetstream WebSocket (`wss://jetstream2.us-east.bsky.network`) to ingest posts in real-time from the Bluesky network
- **Database Layer:** PostgreSQL with pgvector extension for vector similarity search
  - `posts` table: Stores post content, metadata, and 384-dimensional embeddings
  - `authors` table: Stores author profiles, follower counts, and profile embeddings
- **Embedding Pipeline:** Uses ONNX-optimized `all-MiniLM-L6-v2` model to generate semantic embeddings for posts and author profiles
- **Search API (FastAPI):** Exposes multiple search endpoints:
  - `/search/posts` — Full-text search with PostgreSQL tsvector
  - `/search/authors` — Author search by name, handle, or description
  - `/vector/search/posts` — Semantic similarity search using cosine distance
  - `/vector/search/authors` — Find similar authors by profile embeddings
- **Indexing:** Maintains GIN indexes for text search and IVFFlat indexes for vector similarity

**Key Scripts:**

- `ingest.py` — Continuously ingests posts from the firehose
- `embed_posts.py` — Generates embeddings for newly ingested posts
- `embed_authors.py` — Generates embeddings for author profiles
- `api.py` — Serves search API at /api
- `prune.py` — Removes old data to manage storage
- `identify.py` — Processes author metadata

**Why It Matters:** This service is the foundation of the entire system. Without it, neither feed generation nor feed management can function, as they depend on its indexed content, embeddings, and search capabilities.

---

### 2. 🧩 **bluesky-feed-ruleset-generator** — AI-Powered Feed Blueprint Generation

**Purpose:** Transforms natural language descriptions into structured, executable feed blueprints using GPT-4 and multi-source data retrieval.

**Technical Details:**

- **FastAPI Service:** Cloud Run deployment with automatic scaling
- **Natural Language Processing:** Uses OpenAI GPT-4 to interpret user intent and generate feed specifications
- **Multi-Source Data Retrieval:**
  - Queries **bluesky-pds** search API for author discovery
  - Performs vector similarity searches using semantic embeddings
  - Falls back to Bluesky public API for additional author metadata
- **Feed Blueprint Format:** Generates JSON structures with the following schema:

  ```json
  {
    "record_name": "ml-research",
    "display_name": "ML Research Papers",
    "description": "Latest machine learning research and discussions",
    "blueprint": {
      "topic_preferences": [
        { "name": "machine learning", "weight": 0.8 },
        { "name": "neural networks", "weight": 0.7 }
      ],
      "profile_preferences": [
        { "did": "did:plc:abc123", "weight": 0.5 },
        { "did": "did:plc:def456", "weight": 0.5 }
      ],
      "topic_filters": [{ "name": "spam", "weight": 0.5 }],
      "profile_filters": [{ "did": "did:plc:blocked123", "weight": 0.5 }],
      "ranking_weights": {
        "relevance": 0.5,
        "popularity": 0.3,
        "recency": 0.2
      },
      "original_prompt": "Create a feed about machine learning research papers",
      "generated_at": "2026-01-21T12:34:56.789Z"
    }
  }
  ```

  **Blueprint Schema Fields:**
  - `topic_preferences`: Topics/keywords to prioritize (weighted 0.3-1.0)
  - `profile_preferences`: Author DIDs to include in feed (with weights)
  - `topic_filters`: Topics/keywords to exclude or penalize
  - `profile_filters`: Author DIDs to block from feed
  - `ranking_weights`: Must sum to 1.0 (relevance + popularity + recency)
  - `original_prompt`: User's original natural language query
  - `generated_at`: ISO timestamp of generation

- **Author Identification:** Combines three strategies to find relevant authors:
  1. Text-based search on bluesky-pds
  2. Semantic vector search on author embeddings
  3. Bluesky public API actor search

**Key Files:**

- `main.py` — FastAPI app with `/api/generate-feed-ruleset` endpoint
- `generate_feed_ruleset.py` — Core GPT-4 integration and blueprint generation logic
- `cloudbuild.yaml` — Automatic deployment configuration for Cloud Build
- `Dockerfile` — Containerization for Cloud Run

**Input Example:**

```
"Create a feed about machine learning research papers"
```

**Output:** Returns feed metadata (record_name, display_name, description) and blueprint with topics, profiles, filters, and ranking weights as shown above

**Deployment:** Automatically deployed to Google Cloud Run via GitHub push triggers, ensuring the latest AI logic is always available.

---

### 3. 🚀 **bluesky-feed-manager** — Dynamic Feed Deployment and Runtime Management

**Purpose:** The execution engine that deploys feeds to Bluesky and continuously maintains them with real-time content updates, intelligent ranking, and filtering.

**Technical Details:**

- **FastAPI Server:** Self-hosted on a VM with Caddy reverse proxy for HTTPS
- **Database:** SQLite with three core tables:
  - `Feed` — Stores feed metadata (URI, display name, description, blueprint)
  - `FeedSource` — Tracks content sources (author DIDs, search queries) per feed
  - `FeedCache` — Caches post URIs for fast feed serving
  - `SearchCache` — Temporary cache for search results (30-second TTL)
- **Feed Deployment Process:**
  1. Accepts blueprint + credentials from bonsai2
  2. Authenticates with Bluesky using provided handle/password
  3. Creates a feed generator record on the ATProto network
  4. Publishes feed to user's profile via `com.atproto.repo.createRecord`
  5. Stores blueprint in local database for ongoing management
- **Dynamic Feed Generation:** Real-time feed assembly on each request:
  - Parses blueprint to extract preferences and filters:
    - `topic_preferences` — Keywords to boost in relevance scoring
    - `profile_preferences` — Author DIDs to fetch posts from
    - `topic_filters` — Keywords to exclude posts containing
    - `profile_filters` — Author DIDs to block entirely
  - Fetches content from preferred authors via Bluesky API
  - Fetches additional content via text/vector search on bluesky-pds
  - Applies topic and profile filters to remove unwanted content
  - Ranks posts using weighted scoring algorithm:
    - **Relevance:** Matches topic_preferences and profile_preferences (0-1)
      - +1.0 if author is in profile_preferences
      - +weight for each topic match in post text
    - **Popularity:** Log-scaled engagement (likes + 2×replies + 3×reposts) (0-1)
    - **Recency:** Exponential decay over 48 hours (0-1)
    - **Final Score:** `(relevance × w_r) + (popularity × w_p) + (recency × w_c)`
      - Weights from blueprint's `ranking_weights` (normalized to sum to 1.0)
  - Enforces diversity constraints (max 10 posts per author)
  - Applies age limits (default: 48 hours)
  - Returns top 100 post URIs
- **Feed Handler Architecture:** Each deployed feed gets a dedicated handler function loaded into the `algos` registry
- **Caching Strategy:**
  - Search results cached for 30 seconds to reduce API load
  - Uses SQLite `SearchCache` table with TTL expiration
- **Well-Known Endpoints:**
  - `/.well-known/did.json` — Service DID resolution
  - `/xrpc/app.bsky.feed.describeFeedGenerator` — Feed catalog
  - `/xrpc/app.bsky.feed.getFeedSkeleton` — Returns post URIs for feed
  - `/manage-feed` — Admin endpoint for feed creation/updates

**Key Files:**

- `server/app.py` — FastAPI application and route handlers
- `server/algos/feed.py` — Feed generation algorithms and ranking logic
- `server/create_feed.py` — Feed deployment to Bluesky
- `server/models.py` — Database schema and ORM models
- `server/database.py` — Database connection management

**Integration with bluesky-pds:**

- Continuously queries search API for relevant posts
- Uses vector embeddings for similarity-based ranking
- Leverages author embeddings for source discovery

---

### 4. 🌳 **bonsai2** — React Frontend for Feed Creation

**Purpose:** User-facing interface that orchestrates the entire feed creation pipeline from natural language input to live Bluesky deployment.

**Technical Details:**

- **Framework:** React with modern hooks (useState, useEffect)
- **Authentication:** Bluesky handle + app password encryption using AES-GCM
- **Persistence:** Firebase Firestore for storing deployed feed blueprints
  - Enables feed recovery and modification after deployment
  - Each feed stored by unique ID: `{handle}~{record_name}`
- **User Flow:**
  1. User logs in with Bluesky credentials (encrypted locally)
  2. Enters natural language feed description
  3. App sends request to **bluesky-feed-ruleset-generator**
  4. Receives generated blueprint + metadata
  5. User can customize sources, filters, and ranking
  6. App sends blueprint + credentials to **bluesky-feed-manager**
  7. Feed is deployed to user's Bluesky profile
  8. Blueprint saved to Firestore for future reference
- **Components:**
  - `LoginScreen.js` — Secure credential capture
  - `IntentInput.js` — Natural language input for feed description
  - `SourceSelector.js` — UI for selecting/editing content sources
  - `RankingSelector.js` — Choose ranking algorithms
  - `MetadataEditor.js` — Edit feed name, description, record name
  - `FeedBuilderUI.js` — Main orchestration component
- **API Integration:**
  - Calls ruleset generator via Cloud Run URL
  - Calls feed manager via self-hosted API endpoint
  - Stores blueprints in Firestore for recovery
- **Security:** Uses environment variables for API keys and encryption secrets

**Key Files:**

- `src/App.js` — Main application entry point
- `src/components/FeedBuilderUI.js` — Core orchestration logic
- `src/utils/bluesky.js` — Bluesky API client functions
- `src/utils/firebase.js` — Firestore integration
- `src/utils/crypto.js` — AES-GCM encryption utilities

**Deployment:** Static React app hosted on Firebase Hosting, accessible at `https://bonsai.princetonhci.social` or `https://getbonsai.org`.

---

## 🔄 How Everything Connects: Data Flow & Service Relationships

### High-Level Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BLUESKY NETWORK (ATProto)                       │
│                     Real-time Firehose WebSocket                        │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ Posts Stream
                                 ▼
                    ┌──────────────────────────┐
                    │    bluesky-pds           │
                    │  Data Infrastructure     │
                    ├──────────────────────────┤
                    │ • Ingest posts/authors   │
                    │ • Generate embeddings    │
                    │ • Index for search       │
                    │ • Serve search API       │
                    └──────┬──────────┬────────┘
                           │          │
                   API Queries     API Queries
                           │          │
        ┌──────────────────┴──┐   ┌───┴────────────────────┐
        │  ruleset-generator  │   │   feed-manager         │
        │  AI Blueprint Gen   │   │   Runtime Engine       │
        ├─────────────────────┤   ├────────────────────────┤
        │ • Query for authors │   │ • Query for posts      │
        │ • Use embeddings    │   │ • Use embeddings       │
        │ • Generate blueprint│   │ • Rank & filter        │
        └──────┬──────────────┘   │ • Serve feeds          │
               │                  └────┬───────────────────┘
               │ Blueprint             │ Feed URIs
               │                       │
               ▼                       ▼
        ┌─────────────────────────────────────┐
        │           bonsai2                   │
        │        User Interface               │
        ├─────────────────────────────────────┤
        │ • Collect user intent               │
        │ • Request blueprint                 │
        │ • Deploy feed                       │
        │ • Save to Firestore                 │
        └─────────────────────────────────────┘
               │
               │ Deployment Request
               ▼
        ┌─────────────────────────────────────┐
        │     BLUESKY USER PROFILE            │
        │    Published Custom Feed            │
        └─────────────────────────────────────┘
```

### Detailed Service Interactions

#### 1. **Data Foundation (bluesky-pds)**

- **Continuous Operation:** Runs 24/7 ingesting posts from Bluesky firehose
- **Data Processing Pipeline:**
  ```
  Firehose → Ingest → Embed → Index → Serve via API
  ```
- **Storage:**
  - PostgreSQL with pgvector extension
  - ~384-dimensional embeddings per post/author
  - Full-text search indexes
  - Vector similarity indexes
- **Dependencies:** None (foundational service)
- **Dependents:** Both feed-ruleset-generator and feed-manager

#### 2. **Blueprint Generation (feed-ruleset-generator)**

- **Trigger:** HTTP POST from bonsai2 with natural language description
- **Process:**
  1. Receives user intent (e.g., "feed about AI research with no politics")
  2. Queries bluesky-pds to discover relevant authors:
     - `/search/authors?q={query}` — Text search
     - `/vector/search/authors` — Semantic similarity with query embeddings
     - Bluesky public API — Additional author discovery
  3. Sends query + discovered authors to GPT-4 with structured prompt
  4. GPT-4 generates blueprint with schema:
     ```json
     {
       "record_name": "ai-research",
       "display_name": "AI Research",
       "description": "AI research updates without politics",
       "blueprint": {
         "topic_preferences": [
           { "name": "artificial intelligence", "weight": 0.8 },
           { "name": "machine learning", "weight": 0.7 }
         ],
         "profile_preferences": [{ "did": "did:plc:xyz123", "weight": 0.5 }],
         "topic_filters": [{ "name": "politics", "weight": 0.5 }],
         "profile_filters": [],
         "ranking_weights": {
           "relevance": 0.5,
           "popularity": 0.3,
           "recency": 0.2
         },
         "original_prompt": "feed about AI research with no politics",
         "generated_at": "2026-01-21T12:34:56Z"
       }
     }
     ```
  5. Returns structured response with metadata + blueprint to bonsai2
- **Dependencies:** bluesky-pds search API, OpenAI GPT-4 API
- **Response Time:** 5-15 seconds (includes author discovery + GPT-4 inference)

#### 3. **Feed Deployment & Runtime (feed-manager)**

- **Initial Deployment:**
  1. Receives blueprint + Bluesky credentials from bonsai2
  2. Authenticates with Bluesky
  3. Creates feed generator DID document
  4. Publishes feed record to user's profile
  5. Parses blueprint and stores in SQLite:
     - `Feed` table: metadata + serialized ranking_weights
     - `FeedSource` table: Rows for each topic/profile preference and filter
       - `source_type`: "topic_preference" | "profile_preference" | "topic_filter" | "profile_filter"
       - `identifier`: Topic name or author DID
       - `weight`: Numeric weight from blueprint
- **Runtime Operation (every feed request):**
  1. User opens feed in Bluesky app
  2. Bluesky calls `/xrpc/app.bsky.feed.getFeedSkeleton?feed={uri}`
  3. Feed-manager:
     - Loads blueprint from database (FeedSource + ranking_weights)
     - Extracts preferences and filters:
       - `topic_preferences` list with weights
       - `profile_preferences` set of DIDs
       - `topic_filters` for keyword blocking
       - `profile_filters` for author blocking
     - Fetches posts from profile_preferences (Bluesky API)
     - Optionally fetches additional posts via topic_preferences (search API)
     - Filters out blocked authors and keywords
     - Ranks each post using composite score:
       - **Relevance (0-1):**
         - +1.0 if author in profile_preferences
         - +weight for each topic_preference match in text
       - **Popularity (0-1):** `min(log(likes + 2×replies + 3×reposts) / 5, 1.0)`
       - **Recency (0-1):** `exp(-age_seconds / 57600)` (16hr half-life)
       - **Final:** `(rel × w_rel) + (pop × w_pop) + (rec × w_rec)`
     - Enforces diversity (max 10 posts per author)
     - Enforces age limit (48 hours)
     - Returns top 100 post URIs
  4. Bluesky renders posts in feed
- **Caching:** 30-second TTL for search results to reduce API load
- **Dependencies:** bluesky-pds search API, Bluesky ATProto API

#### 4. **User Interface (bonsai2)**

- **Authentication Flow:**
  1. User enters Bluesky handle + app password
  2. Credentials encrypted with AES-GCM using secret key
  3. Stored in React state (not persisted)
- **Feed Creation Flow:**
  1. User describes desired feed in natural language
  2. `POST` to feed-ruleset-generator:
     ```javascript
     POST /api/generate-feed-ruleset
     Body: { "query": "machine learning papers without politics" }
     ```
  3. Receives response:
     ```javascript
     {
       "record_name": "ml-papers",
       "display_name": "ML Papers",
       "description": "Machine learning papers without politics",
       "blueprint": {
         "topic_preferences": [...],
         "profile_preferences": [...],
         "topic_filters": [...],
         "profile_filters": [...],
         "ranking_weights": {...}
       }
     }
     ```
  4. User customizes via UI components:
     - `SourceSelector` (preferences): Edit topic_preferences and profile_preferences
     - `SourceSelector` (filters): Edit topic_filters and profile_filters
     - `RankingSelector`: Adjust ranking_weights sliders
     - `MetadataEditor`: Edit record_name, display_name, description
  5. User clicks "Deploy"
  6. `POST` to feed-manager:
     ```javascript
     POST /manage-feed
     Body: {
       "handle": "user.bsky.social",
       "password": "app-password",
       "hostname": "feed.example.com",
       "record_name": "ml-papers",
       "display_name": "ML Papers",
       "description": "Machine learning papers without politics",
       "blueprint": {
         "topic_preferences": [...],
         "profile_preferences": [...],
         "topic_filters": [...],
         "profile_filters": [...],
         "ranking_weights": {...}
       }
     }
     ```
  7. Feed deployed and URI returned
  8. Blueprint saved to Firestore:
     ```
     Collection: deployed_feeds
     Document: {handle}~{record_name}
     Data: {blueprint, metadata, timestamp}
     ```
- **Dependencies:** Both feed-ruleset-generator and feed-manager, Firebase Firestore

### Key Technical Integrations

| From Service      | To Service         | Protocol     | Data Exchanged                          |
| ----------------- | ------------------ | ------------ | --------------------------------------- |
| Bluesky Network   | bluesky-pds        | WebSocket    | Real-time post stream (Jetstream)       |
| bonsai2           | ruleset-generator  | HTTP REST    | Natural language query → JSON blueprint |
| bonsai2           | feed-manager       | HTTP REST    | Blueprint + credentials → Feed URI      |
| ruleset-generator | bluesky-pds        | HTTP REST    | Search queries → Author/post results    |
| feed-manager      | bluesky-pds        | HTTP REST    | Post/author queries → Ranked results    |
| feed-manager      | Bluesky ATProto    | HTTP XRPC    | Feed records → Published feeds          |
| Bluesky App       | feed-manager       | HTTP XRPC    | Feed requests → Post URIs               |
| bonsai2           | Firebase Firestore | Firebase SDK | Blueprint persistence                   |
| feed-ruleset-gen  | OpenAI GPT-4       | HTTP REST    | Intent + context → Structured blueprint |

### Embedding & Similarity Flow

1. **Embedding Generation:**
   - bluesky-pds runs `embed_posts.py` and `embed_authors.py` periodically
   - Uses `all-MiniLM-L6-v2.onnx` model (384 dimensions)
   - Stores vectors in PostgreSQL with pgvector

2. **Semantic Search:**
   - User query → Embedded by ruleset-generator
   - Compared against author/post embeddings in bluesky-pds
   - Cosine similarity: `1 - (embedding1 <=> embedding2)`
   - Top matches returned

3. **Feed Ranking:**
   - Feed-manager can use embeddings for similarity-based ranking
   - Posts semantically similar to feed intent ranked higher
   - Combined with recency and engagement signals

---

## 📊 Service Comparison Summary

| Aspect               | bluesky-pds                     | ruleset-generator       | feed-manager                 | bonsai2                 |
| -------------------- | ------------------------------- | ----------------------- | ---------------------------- | ----------------------- |
| **Type**             | Backend / Data Infrastructure   | Stateless AI Service    | Backend / Runtime Engine     | Frontend / UI           |
| **Language**         | Python + PostgreSQL             | Python + FastAPI        | Python + FastAPI + SQLite    | JavaScript + React      |
| **Deployment**       | Self-hosted VM                  | Google Cloud Run        | Self-hosted VM               | Firebase Hosting        |
| **Database**         | PostgreSQL + pgvector           | None (stateless)        | SQLite                       | Firebase Firestore      |
| **Primary Function** | Data ingestion & search         | Blueprint generation    | Feed deployment & serving    | User interface          |
| **Dependencies**     | Bluesky firehose                | bluesky-pds, OpenAI     | bluesky-pds, Bluesky ATProto | All other services      |
| **Scaling**          | Vertical (more storage/compute) | Horizontal (Cloud Run)  | Vertical (VM size)           | CDN (Firebase)          |
| **Uptime Req.**      | 24/7 (critical)                 | On-demand               | 24/7 (feeds must respond)    | On-demand (static site) |
| **AI/ML**            | ONNX embeddings                 | GPT-4 + ONNX embeddings | ONNX embeddings for ranking  | None                    |

---

## ⚙️ Recommended Setup & Build Order

To ensure all dependencies work correctly, the services should be deployed and started in this order:

### 1. **bluesky-pds** (Foundation Layer)

**Deploy First** — All other services depend on this.

**Setup Steps:**

1. Create GCP VM (e2-standard-2, 8GB RAM)
2. Set up PostgreSQL with pgvector extension
3. Configure environment variables (DB connection, API keys)
4. Run initial scripts:
   ```bash
   python ingest.py      # Start firehose ingestion (run as service)
   python embed_posts.py # Generate post embeddings (run periodically)
   python embed_authors.py # Generate author embeddings (run periodically)
   python api.py         # Start search API on at /api
   ```
5. Verify search API is accessible at `http://{pds-host}/api/search/posts`

**Time to Production:** 2-3 hours (including data ingestion warm-up)

---

### 2. **bluesky-feed-ruleset-generator** (AI Layer)

**Deploy Second** — Requires bluesky-pds search API to be operational.

**Setup Steps:**

1. Configure GitHub → Cloud Build trigger
2. Set environment variables in Cloud Build:
   - `OPENAI_API_KEY` — For GPT-4 API access
   - `CUSTOM_API_URL` — Points to bluesky-pds search API
   - `API_KEY` — For authenticating incoming requests
3. Push to main branch → Automatic deployment to Cloud Run
4. Note the Cloud Run service URL (e.g., `https://bluesky-feed-ruleset-generator-xxx.run.app`)
5. Test with:
   ```bash
   curl -X POST https://your-service.run.app/api/generate-feed-ruleset \
     -H "Content-Type: application/json" \
     -H "x-api-key: YOUR_API_KEY" \
     -d '{"query": "machine learning research"}'
   ```

**Time to Production:** 30 minutes (automated Cloud Build)

---

### 3. **bluesky-feed-manager** (Runtime Engine)

**Deploy Third** — Requires ruleset generator for blueprint format and bluesky-pds for content queries.

**Setup Steps:**

1. Create GCP VM (e2-micro, 1GB RAM sufficient)
2. Install Python, SQLite, Caddy
3. Configure environment variables:
   - `CUSTOM_API_URL` — Points to bluesky-pds search API
   - `SERVICE_DID` — Feed generator DID
   - `HOSTNAME` — Your feed domain (e.g., `feed.example.com`)
   - `API_KEY` — For authenticating incoming requests
4. Run server:
   ```bash
   ./run_server.sh
   ```
5. Configure Caddy for HTTPS reverse proxy
6. Verify at `https://feed.example.com/.well-known/did.json`

**Time to Production:** 1-2 hours

---

### 4. **bonsai2** (User Interface)

**Deploy Last** — Requires both ruleset generator and feed manager to be operational.

**Setup Steps:**

1. Configure `.env` file with:
   - `REACT_APP_BLUESKY_FEED_RULESET_GENERATOR_API` — Cloud Run URL from step 2
   - `REACT_APP_BLUESKY_FEED_MANAGER_API` — Feed manager URL from step 3
   - `REACT_APP_FEED_API_KEY` — API key for backend services
   - Firebase configuration (all `REACT_APP_FIREBASE_*` variables)
2. Build React app:
   ```bash
   npm install
   npm run build
   ```
3. Deploy to Firebase Hosting:
   ```bash
   firebase deploy
   ```
4. Access at `https://your-project.web.app`

**Time to Production:** 15 minutes

---

## 🔧 Development vs Production Configuration

### Development Setup

For local development, you can run simplified versions:

- **bluesky-pds:** Run locally with Docker Compose for PostgreSQL
- **ruleset-generator:** Run with `uvicorn main:app --reload` on port 8080
- **feed-manager:** Run with `uvicorn server.__main__:app --reload` on port 8000
- **bonsai2:** Run with `npm start` on port 3000

All services can point to localhost URLs for testing.

### Production Considerations

- **bluesky-pds:**
  - Use separate VMs for database and application
  - Configure automated backups for PostgreSQL
  - Set up log rotation for ingestion scripts
  - Monitor disk usage (embeddings consume significant space)
- **ruleset-generator:**
  - Monitor OpenAI API costs
  - Set Cloud Run concurrency limits
  - Enable Cloud Run authentication if needed
- **feed-manager:**
  - Use Caddy for automatic SSL certificate renewal
  - Configure firewall rules for ports 80, 443, 8000
  - Monitor SQLite database size
  - Set up systemd services for auto-restart
- **bonsai2:**
  - Configure Firebase security rules
  - Set up proper CORS origins
  - Enable Firebase Analytics if desired

---

## 🚦 Health Check & Monitoring

### Service Health Endpoints

| Service           | Health Check URL                             | Expected Response      |
| ----------------- | -------------------------------------------- | ---------------------- |
| bluesky-pds       | `http://{host}/api/search/posts?q=test`      | JSON array of posts    |
| ruleset-generator | `https://{cloud-run-url}/api/health`         | `{"status": "ok"}`     |
| feed-manager      | `https://{feed-domain}/.well-known/did.json` | JSON with DID document |
| bonsai2           | `https://{firebase-domain}/`                 | React app loads        |

### Critical Dependencies

Each service's functionality depends on:

- **bluesky-pds:** Bluesky firehose (external), PostgreSQL (internal)
- **ruleset-generator:** bluesky-pds search API, OpenAI API (external)
- **feed-manager:** bluesky-pds search API, Bluesky ATProto API (external)
- **bonsai2:** ruleset-generator, feed-manager, Firebase (external)

---

## 📚 Additional Resources

### Repository Structure Details

- **bluesky-feed-manager/**: See [bluesky-feed-manager/README.md](bluesky-feed-manager/README.md) for detailed deployment instructions
- **bluesky-feed-ruleset-generator/**: See [bluesky-feed-ruleset-generator/README.md](bluesky-feed-ruleset-generator/README.md) for Cloud Build setup
- **bluesky-pds/**: See [bluesky-pds/README.md](bluesky-pds/README.md) for database schema and API documentation
- **bonsai2/**: See [bonsai2/README.md](bonsai2/README.md) for frontend architecture and Firebase setup

### Key Technologies Used

- **Backend:** Python 3.11+, FastAPI, uvicorn
- **Database:** PostgreSQL 16 with pgvector, SQLite
- **ML/AI:** OpenAI GPT-4, ONNX Runtime, Sentence Transformers
- **Infrastructure:** Google Cloud (Compute Engine, Cloud Run, Cloud Build), Firebase
- **Networking:** Caddy (reverse proxy), WebSocket (firehose)
- **Frontend:** React 18, Firebase SDK, Axios

---

## 🤝 Contributing

This is a research project from Princeton HCI. Contributions and feedback are welcome!

---

## 📄 License

See individual LICENSE files in each subdirectory. The project uses various open-source licenses.

---

**Princeton HCI — 2026**
