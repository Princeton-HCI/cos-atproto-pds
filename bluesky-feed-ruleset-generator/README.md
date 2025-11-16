# 🧩 bluesky-feed-ruleset-generator — Feed Ruleset Creation

This subdirectory contains a **FastAPI-based API** that generates feed rules using `generate_feed_ruleset.py`.
It’s designed to be **automatically built and deployed from GitHub** to **Cloud Run** using **Cloud Build**.

---

## 🗂️ Contents

- `main.py` – FastAPI entrypoint with `/api/health` and `/api/generate-feed-ruleset`
- `generate_feed_ruleset.py` – Feed generation logic
- `requirements.txt` – Python dependencies
- `Dockerfile` – Container build instructions for Cloud Run
- `cloudbuild.yaml` – Cloud Build configuration for automated builds and deployments

---

## 🧰 Prerequisites

- Python 3.11+ (for local development and testing)
- A **Google Cloud project** with billing enabled
- The following Google Cloud APIs must be enabled:

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

- Your GitHub repository must be connected to Cloud Build via **Developer Connect**.
- You should have a **Cloud Build trigger** configured (see below) that references
  `bluesky-feed-ruleset-generator/cloudbuild.yaml` for automatic deployment.

---

## 🚀 Local Development (Optional)

1. **Create a virtual environment:**

```bash
python3 -m venv venv
source venv/bin/activate
```

2. **Install dependencies:**

```bash
pip install -r requirements.txt
```

3. **Set your API key (for local runs only):**

```bash
export API_KEY="my-secret-key"
```

4. **Run locally:**

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8080
```

---

## 🏗️ Automatic Deployment via Cloud Build (GitHub Trigger)

This project is automatically **built and deployed to Cloud Run** whenever code is pushed to the `main` branch of the GitHub repository, using **Cloud Build triggers**.

### Steps to Create the Trigger

1. Go to **Cloud Build → Triggers → Create Trigger**.
2. Fill out the form with the following settings:

| Field                           | Example / Notes                                            |
| ------------------------------- | ---------------------------------------------------------- |
| **Name**                        | `update-bluesky-feed-ruleset-generator` (must be unique)   |
| **Region**                      | `global`                                                   |
| **Description**                 | Trigger to build & deploy the custom feed API on push      |
| **Event**                       | `Push to a branch`                                         |
| **Repository service**          | `Cloud Build repositories → Developer Connect`             |
| **Repository**                  | `Princeton-HCI/cos-atproto-pds` (connected via GitHub App) |
| **Branch**                      | `^main$` (regular expression for the branch)               |
| **Included files filter**       | optional, e.g. `bluesky-feed-ruleset-generator/**`         |
| **Configuration Type**          | `Cloud Build configuration file (yaml/json)`               |
| **Cloud Build config location** | `bluesky-feed-ruleset-generator/cloudbuild.yaml`           |

> 💡 Built-in variables like `$PROJECT_ID`, `$REPO_NAME`, `$COMMIT_SHA`, and `$SHORT_SHA` are automatically available.

The `cloudbuild.yaml` file defines:

- building the Docker image for `bluesky-feed-ruleset-generator`
- pushing it to Artifact Registry or GCR
- deploying it to **Cloud Run**, setting environment variables automatically

You do **not** need to manually configure Docker commands in the trigger UI.

**Deploying the API**
After Cloud Build completes successfully, a new Cloud Run service is created. Go to the service’s **Security** settings and ensure **Authentication** is set to allow public access.

---

### 🔐 Substitution Variables (Environment Secrets)

Because Cloud Run deployments happen automatically via Cloud Build, environment variables (like API keys) are securely injected at build time using **Cloud Build substitution variables**.

When creating or editing your trigger, scroll down to:

**→ Advanced → Substitution variables**

Add the following variables:

| Variable name     | Example value               | Purpose                                            |
| ----------------- | --------------------------- | -------------------------------------------------- |
| `_API_KEY`        | `your-secret-api-key`       | Protects API access                                |
| `_OPENAI_API_KEY` | `sk-your-openai-key`        | Used by `generate_feed_ruleset.py`                 |
| `_CUSTOM_API_URL` | `https://myapi.example.com` | Custom endpoint used by `generate_feed_ruleset.py` |

These are securely passed to the deploy command in your `cloudbuild.yaml`:

```yaml
--set-env-vars API_KEY=$_API_KEY,OPENAI_API_KEY=$_OPENAI_API_KEY,CUSTOM_API_URL=$_CUSTOM_API_URL
```

> ⚠️ Do **not** commit these secrets to GitHub. They are stored securely in Cloud Build and passed to Cloud Run at deploy time.

---

### Setup Notes

After Cloud Build deploys the `bluesky-feed-ruleset-generator` service to Cloud Run:

1. **Enable Firestore API**
   Go to [Firestore API](https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=cos-atproto-pds) and enable it for your project.

2. **Create a Firestore database**

   - Navigate to [Firestore setup](https://console.cloud.google.com/datastore/setup?project=cos-atproto-pds).
   - Choose a **location** matching your Cloud Run region (e.g., `us-central1`).
   - Pick **Native mode**.
   - Click **Create database**.

3. **Add the `custom_feed_rulesets` collection**

   - Once the database is ready, create a collection named `custom_feed_rulesets`.

4. **Set permissions**

   - Ensure the Cloud Run service account has **read/write access** to the collection.
   - Make the Cloud Run service **publicly accessible** via Security → Authentication → Allow public access.

---

## 🔍 Endpoints

### `/api/health`

- **GET**
- **Headers:** `x-api-key`
- **Response:** `{ "message": "Hello world!" }`

### `/api/generate-feed-ruleset`

- **POST**
- **Headers:** `x-api-key`, `Content-Type: application/json`
- **Body:** `{ "query": "<your natural language prompt>" }`
- **Response:** JSON rules generated by `generate_feed_ruleset.py`
