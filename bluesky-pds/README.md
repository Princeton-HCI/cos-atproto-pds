# 📘 bluesky-pds — Personal Data Server with Embeddings

This guide walks you through setting up a self-hosted Bluesky PDS that ingests data from the ATProto firehose and exposes a FastAPI-powered search API. It uses Google Cloud Platform (GCP), Python, and Caddy for HTTPS proxying.

---

## 1. Create a GCP PDS VM

**Settings:**

- OS: Ubuntu 24.04 LTS
- Machine Type: `e2-small`
- Storage: 20GB
- Enable: HTTP & HTTPS traffic

---

## 2. Set Up Firewall Rule

1. Go to **VPC Network > Firewall Rules**.
2. Click **Create Firewall Rule**.
3. Set:
   - **Name**: `allow-web`
   - **Targets**: Apply to specific instances (select your VM)
   - **Source IP ranges**: `0.0.0.0/0`
   - **Protocols and Ports**: `tcp:80,443,5432,8000`

---

## 3. Assign Static External IP

1. Go to **VPC Network > External IP addresses**.
2. Reserve a static IP.
3. Assign it to your VM.

---

## 4. Create a GCP Database VM

**Settings:**

- OS: Ubuntu 24.04 LTS
- Machine Type: `e2-standard-2`
- Storage: 50GB
- Enable: HTTP & HTTPS traffic

---

### Install Postgres on the VM

SSH into the second VM and run the following:

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib postgresql-16-pgvector
```

Start and enable the service:

```bash
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Check status:

```bash
sudo systemctl status postgresql
```

---

### Create a Postgres user and database

```bash
# Switch to postgres user
sudo -i -u postgres
psql

# Inside psql, create user with password:
CREATE USER blueskydbuser WITH PASSWORD <SET A PASSWORD>;

# Promote your user to superuser
ALTER USER blueskydbuser WITH SUPERUSER;

# Create database owned by this user
CREATE DATABASE blueskydb OWNER blueskydbuser;

# Grant privileges (optional if user owns the DB)
GRANT ALL PRIVILEGES ON DATABASE blueskydb TO blueskydbuser;

# Enable vector extension in your database
CREATE EXTENSION IF NOT EXISTS vector;

\q
exit
```

---

### Configure Postgres for external access

By default, Postgres only allows **local connections**. To allow your embedding scripts to connect:

1. Edit **postgresql.conf**:

```bash
sudo nano /etc/postgresql/16/main/postgresql.conf
# Listen on all addresses
listen_addresses = '*'
```

2. Edit **pg_hba.conf** to allow your VM’s user to connect:

```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
# Add at the end:
host    all             all             0.0.0.0/0           md5
```

3. Restart Postgres:

```bash
sudo systemctl restart postgresql
```

---

### Test Connection from VM

SSH into your first VM and install `psql`:

```bash
sudo apt update
sudo apt install -y postgresql-client
```

Run:

```bash
psql "host=<your-instance-public-ip> dbname=pds_db user=pds_user password=<your-password> sslmode=require"
```

If successful, you’ll see the PostgreSQL prompt:

```
pds_db=>
```

Type `\q` to quit.

## 5. SSH into VM and Install Websocat

Websocat is needed for consuming the ATProto firehose.

```bash
sudo wget -qO /usr/local/bin/websocat https://github.com/vi/websocat/releases/latest/download/websocat.x86_64-unknown-linux-musl
sudo chmod a+x /usr/local/bin/websocat
websocat --version
```

Test connection:

```bash
websocat "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post" > output.json
```

You can check for signs of life with the command `cat output.json`. More on Jetstream: [https://docs.bsky.app/blog/jetstream](https://docs.bsky.app/blog/jetstream)

---

## 6. Install and Configure PDS

For this you can follow official guide from the section titled 'Configure DNS for your domain' onwards:

- [https://atproto.com/guides/self-hosting#configure-dns-for-your-domain](https://atproto.com/guides/self-hosting#configure-dns-for-your-domain)

Once done you can return here and continue onwards.

---

## 7. Install Python and Dependencies

```bash
sudo apt update
sudo apt install -y python3-pip xdg-utils

sudo pip3 install --upgrade --force-reinstall --ignore-installed \
    websockets \
    aiohttp \
    asyncio \
    asyncpg \
    numpy \
    typing-extensions \
    onnxruntime \
    python-dotenv \
    fastapi \
    uvicorn \
    transformers \
    matplotlib \
    pandas \
    seaborn \
    --break-system-packages
```

_NOTE: Pasting the entire command block above and running it in the terminal takes approximately 10-15 minutes to complete, so feel free to have things run on their own until completeion._

---

## 8. PDS Embeddings-Powered Search API + Python Scripts

This repository comes bundled with a full suite of Python scripts designed to make interacting with your PDS (Personal Data Server) seamless and powerful. These scripts leverage embeddings-based search, enabling you to perform advanced, semantic queries across your feeds and data—far beyond simple keyword matching. Simply clone the repo and navigate into the project directory to access them:

```bash
git clone https://github.com/Princeton-HCI/cos-atproto-pds.git
cd cos-atproto-pds/bluesky-pds
```

The files included are:

- `debug.py` — for basic database and connectivity checks
- `ingest.py` — ATProto firehose ingestion (posts)
- `identify.py` — author discovery and profile aggregation
- `embed_posts.py` — generates embeddings for posts
- `embed_authors.py` — generates embeddings for authors
- `prune.py` — monitors database size and prunes old posts
- `api.py` — FastAPI-powered search and vector query API

It is **no longer imperative** to run these scripts manually for normal operation, as they are typically managed via the provided shell scripts.

However, if you do choose to run them manually (for debugging or initial validation), the recommended order is:

1. `ingest.py`
2. `identify.py`
3. `embed_posts.py`
4. `embed_authors.py`
5. `prune.py`
6. `api.py`

This order ensures data flows correctly from ingestion → author aggregation → embedding → pruning → API exposure.

Before running them however, update the example .env file in a text editor:

```bash
cp .env.example .env
nano .env
```

- `DB_HOST` – The hostname or IP address of the PostgreSQL server running on your VM (use `127.0.0.1` if Postgres is on the same VM).
- `DB_PORT` – The PostgreSQL port on the VM (usually `5432` unless changed in `postgresql.conf`).
- `DB_NAME` – The name of the PostgreSQL database created on the VM.
- `DB_USER` – The PostgreSQL user/role created on the VM for the application.
- `DB_PASSWORD` – The password for the PostgreSQL user created on the VM.
- `PRUNE_DB_THRESHOLD_GB` – The maximum database size (in GB) before the prune script starts deleting old posts.
- `PRUNE_DELETE_COUNT` – The number of posts to delete per prune cycle once the size threshold is exceeded.
- `PRUNE_INTERVAL_SEC` – The number of seconds to wait between successive prune checks.

Once all the environment variables are in place, run the four python scripts.

---

## 9. Benchmarking Firehose Ingest Performance

The repository includes **`benchmark.py`**, which measures:

- Ingestion time
- Embedding generation time
- Database insert time

Each benchmark run:

- **10 trials**
- **30 seconds per trial**
- Generates performance visualizations

### Run on the VM

SSH into your GCP VM and run:

```bash
python3 benchmark.py
```

This produces the following files **on the VM filesystem**:

- `line_plot_times.png`
- `bell_curves_rates.png`

These images are useful for assessing the efficiencey of the PDS VM and the Bluesky search API.

---

## 10. Install and Authenticate gcloud CLI (Local Machine)

Since the GCP VMs are headless, to view these images you need to pull them down locally. To do that you must install and authenticate the **Google Cloud CLI** locally.

---

### macOS

Install:

```bash
brew install --cask google-cloud-sdk
```

Restart your terminal, then authenticate:

```bash
gcloud init
```

This will:

- Open a browser
- Log you into Google
- Select a GCP project
- Configure default region/zone

Verify:

```bash
gcloud compute instances list
```

---

### Linux (Ubuntu / Debian)

Install:

```bash
sudo apt update
sudo apt install -y google-cloud-cli
```

Authenticate:

```bash
gcloud init
```

Verify:

```bash
gcloud compute instances list
```

---

### Windows

1. Download the installer:
   [https://cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)

2. Run the installer and enable:

   - “Add gcloud to PATH”
   - “Install bundled Python”

3. Open **PowerShell** or **Command Prompt**, then authenticate:

```powershell
gcloud init
```

Verify:

```powershell
gcloud compute instances list
```

---

## 11. Pull Benchmark Images from VM to Local Machine

Run these commands **from your local machine** (not the VM).

---

### macOS / Linux

```bash
gcloud compute scp <user>@bluesky-pds:/home/<user>/cos-atproto-pds/bluesky-pds/line_plot_times.png ./line_plot_times.png --zone=<YOUR VM ZONE>
```

```bash
gcloud compute scp <user>@bluesky-pds:/home/<user>/cos-atproto-pds/bluesky-pds/bell_curves_rates.png ./bell_curves_rates.png --zone=<YOUR VM ZONE>
```

Open the images:

```bash
open line_plot_times.png
open bell_curves_rates.png
```

---

### Windows (PowerShell)

```powershell
gcloud compute scp <user>@bluesky-pds:/home/<user>/cos-atproto-pds/bluesky-pds/line_plot_times.png .\line_plot_times.png --zone=<YOUR VM ZONE>
```

```powershell
gcloud compute scp <user>@bluesky-pds:/home/<user>/cos-atproto-pds/bluesky-pds/bell_curves_rates.png .\bell_curves_rates.png --zone=<YOUR VM ZONE>
```

Open the images:

```powershell
start line_plot_times.png
start bell_curves_rates.png
```

---

Here’s the updated section with the **explicit recommended startup order** added at the end, without changing the existing structure or tone:

---

## 12. Shell Scripts to Manage Services

The repository includes shell scripts to run each long-lived service in the background and automatically restart them if they exit:

- `run_ingest.sh` — ATProto firehose ingestion
- `run_prune.sh` — database size monitoring and post pruning
- `run_api.sh` — FastAPI search API
- `run_identify.sh` — author identification and metadata aggregation
- `run_embed_posts.sh` — post embedding worker
- `run_embed_authors.sh` — author embedding worker

Make all scripts executable:

```bash
chmod +x run_*.sh
```

Start services as needed:

```bash
./run_ingest.sh start
./run_prune.sh start
./run_identify.sh start
./run_embed_posts.sh start
./run_embed_authors.sh start
./run_api.sh start
```

Stop a service:

```bash
./run_<service>.sh stop
```

Check service status or logs (if supported by the script):

```bash
./run_<service>.sh status
```

> 💡 You can run these selectively depending on your workload (for example, disabling embedding workers during ingestion catch-up).

### Recommended startup order

While services can be started independently, the recommended order for a clean start is:

1. `run_ingest.sh` — begin collecting posts
2. `run_identify.sh` — resolve authors and metadata
3. `run_embed_posts.sh` — embed ingested posts
4. `run_embed_authors.sh` — embed author data
5. `run_prune.sh` — enforce database size limits
6. `run_api.sh` — expose search and vector endpoints

This ordering ensures data flows correctly from ingestion → enrichment → embedding → pruning → API access.

## 13. Set Up Caddy Proxy

Your PDS likely already uses Caddy via Docker.

### Find Caddy Container:

```bash
cd ~
sudo docker ps
```

Look for the container running the `caddy:2` image.

### Locate the Caddyfile:

Caddy configs are usually mounted at `/pds/caddy/etc/caddy/Caddyfile` we can edit it to our liking by doing:

```bash
sudo nano /pds/caddy/etc/caddy/Caddyfile
```

Add this block under your domain:

```caddy
*.yourdomain.com, yourdomain.com {
    tls {
        on_demand
    }

    # ADD THIS TO THE FILE
    route /api/* {
        uri strip_prefix /api
        reverse_proxy http://0.0.0.0:8000
    }

    reverse_proxy http://localhost:3000
}
```

Restart Caddy:

```bash
sudo docker restart <caddy-container-id>
```

---

## 15. Verify

Test search endpoint:

```
https://yourdomain.com/api/search?q=example
```

You should get results from your ingested posts.

---

## 16. Useful Queries

Here are some useful

### 3. Drop tables

**`dropAuthors`**

```sql
DROP TABLE
  "public"."authors";
```

**`dropPosts`**

```sql
DROP TABLE
  "public"."posts";
```

### 4. Quick stats and previews

**`getAuthors1k`**

```sql
SELECT *
FROM authors
ORDER BY updated_at DESC
LIMIT 1000;
```

**`getAuthorsCount`**

```sql
SELECT COUNT(*) AS author_count
FROM authors;
```

**`getPosts1k`**

```sql
SELECT *
FROM posts
ORDER BY created_at DESC
LIMIT 1000;
```

**`getPostsCount`**

```sql
SELECT COUNT(*) AS post_count
FROM posts;
```

Each query now has a clear name label for easier reference and saving in Cloud SQL Studio.

---

## ✅ Done

You now have a working:

- ATProto PDS
- Firehose ingester
- Pruning script
- FastAPI-powered search API
- Reverse proxy via Caddy
- Performance benchmarking with visual analysis

You can now build richer services on top of your self-hosted Bluesky data!
