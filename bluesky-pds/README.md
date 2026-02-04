# 📘 bluesky-pds — Personal Data Server with Embeddings

This guide walks you through setting up a self-hosted Bluesky PDS that ingests data from the ATProto firehose and exposes a FastAPI-powered search API. It uses Google Cloud Platform (GCP), Python, and Caddy for HTTPS proxying.

---

## 1. Create a GCP PDS VM

**Settings:**

- OS: Ubuntu 24.04 LTS
- Machine Type: `e2-standard-2` (2 vCPUs, 8GB RAM for embedding performance)
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

### Install Postgres on the Database VM

SSH into the second VM (the database one) and run the following:

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib postgresql-16-pgvector htop iotop
```

Start and enable the service:

```bash
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Check status (the output should say that the service is active):

```bash
sudo systemctl status postgresql
```

---

### Create a Postgres user and database

Switch to postgres user

```bash
sudo -i -u postgres
```

Load up the postgres service

```bash
psql
```

Inside psql, create user with password

```bash
CREATE USER blueskydbuser WITH PASSWORD '<SET A PASSWORD>';
```

Promote your user to superuser

```bash
ALTER USER blueskydbuser WITH SUPERUSER;
```

Create database owned by this user

```bash
CREATE DATABASE blueskydb OWNER blueskydbuser;
```

Grant privileges to this user

```bash
GRANT ALL PRIVILEGES ON DATABASE blueskydb TO blueskydbuser;
```

Enable vector extension in your database

```bash
CREATE EXTENSION IF NOT EXISTS vector;
```

Once done, exit out

```bash
\q
```

```bash
exit
```

---

### Configure Postgres for external access

By default, Postgres only allows **local connections**. To allow your PDS VM-based scripts to connect:

#### Edit **postgresql.conf**:

```bash
sudo nano /etc/postgresql/16/main/postgresql.conf
```

Scroll down and uncomment the line that starts with `listen_addresses`, then paste replace `'localhost'` with `'*'`.

#### Edit **pg_hba.conf** to allow your VM's user to connect:

```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

Add this at the end:

```conf
host    all             all             0.0.0.0/0           md5
```

#### Restart Postgres:

```bash
sudo systemctl restart postgresql
```

---

### Test Connection from PDS VM

SSH into your first VM and install `psql`:

```bash
sudo apt update
sudo apt install -y postgresql-client
```

Run:

```bash
psql "host=<your-instance-public-ip> dbname=pds_db user=pds_user password=<your-password> sslmode=require"
```

If successful, you'll see the PostgreSQL prompt:

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
sudo apt install -y python3-pip xdg-utils htop iotop

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

- `ingest.py` — ATProto firehose ingestion (posts)
- `prune.py` — automatic disk-based pruning (deletes 50% of oldest posts when disk usage exceeds 75%)
- `identify.py` — author discovery and profile aggregation
- `embed_posts.py` — generates embeddings for posts
- `embed_authors.py` — generates embeddings for authors
- `api.py` — FastAPI-powered search and vector query API

It is **no longer imperative** to run these scripts manually for normal operation, as they are typically managed via the provided shell scripts.

However, if you do choose to run them manually (for debugging or initial validation), the recommended order is:

1. `ingest.py`
2. `prune.py`
3. `identify.py`
4. `embed_posts.py`
5. `embed_authors.py`
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
- `DISK_THRESHOLD_PERCENT` – Disk usage percentage that triggers automatic pruning (default: 75.0). When exceeded, 50% of oldest posts are deleted.
- `CHECK_INTERVAL_SEC` – How often to check disk usage in seconds (default: 1800, i.e., 30 minutes).

Once all the environment variables are in place, run the python scripts manually in order, or wait until we introduce the shell method of running each service in the next step.

---

## 9. Shell Scripts to Manage Services

The repository includes shell scripts to run each long-lived service in the background and automatically restart them if they exit:

- `run_ingest.sh`
- `run_prune.sh`
- `run_identify.sh`
- `run_embed_posts.sh`
- `run_embed_authors.sh`
- `run_api.sh`

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
2. `run_prune.sh` — enforce database size limits
3. `run_identify.sh` — resolve authors and metadata
4. `run_embed_posts.sh` — embed ingested posts
5. `run_embed_authors.sh` — embed author data
6. `run_api.sh` — expose search and vector endpoints

This ordering ensures data flows correctly from ingestion → enrichment → embedding → pruning → API access.

## 10. Set Up Caddy Proxy

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

## 11. Verify

Test search endpoint:

```
https://yourdomain.com/api/search?q=example
```

You should get results from your ingested posts.

---

## 12. Useful Queries (VM-Hosted Postgres)

These queries can be run either:

- **Locally on the database VM**, or
- **Remotely from the PDS VM** using the database VM's **external IP + password**

---

### Connect to Postgres (from the Database VM)

SSH into the **database VM**, then run:

```bash
sudo -i -u postgres psql blueskydb
```

You'll be prompted for the password if required.

---

### Connect to Postgres (from the PDS VM)

From the **PDS VM**, connect using the database VM's **external IP**:

```bash
psql -h <DB_VM_EXTERNAL_IP> -U blueskydbuser -d blueskydb
```

Enter the password defined during database setup when prompted.

> 🔒 This works because `pg_hba.conf` allows password (`md5`) connections and the firewall permits port `5432`.

---

### 1. Drop tables

**`dropAuthors`**

```sql
DROP TABLE IF EXISTS public.authors;
```

**`dropPosts`**

```sql
DROP TABLE IF EXISTS public.posts;
```

---

### 2. Quick stats and previews

**`getAuthors1k`**

```sql
SELECT * FROM authors ORDER BY updated_at DESC LIMIT 1000;
```

**`getAuthorsCount`**

```sql
SELECT COUNT(*) AS author_count FROM authors;
```

**`getPosts1k`**

```sql
SELECT * FROM posts ORDER BY created_at DESC LIMIT 1000;
```

**`getPostsCount`**

```sql
SELECT COUNT(*) AS post_count FROM posts;
```

---

### Exit `psql`

```sql
\q
```

---

## 13. Monitoring VM Performance

To monitor resource usage on your VMs (CPU, memory, disk I/O), use `htop` for overall system stats and `iotop` for disk I/O details. These help diagnose bottlenecks during high loads (e.g., embedding or querying).

### Using htop

`htop` provides a real-time view of CPU, memory, and processes.

```bash
htop
```

- **Key Metrics**:
  - **CPU**: Look for high usage (>80%) on embedding processes.
  - **Memory**: Ensure RAM isn't maxed (aim <90% usage).
  - **Processes**: Sort by CPU/MEM to see top consumers (e.g., `python3 embed_posts.py`).
- **Navigation**: Press `F6` to sort, `F9` to kill processes, `q` to quit.

### Using iotop

`iotop` shows disk I/O per process, useful for DB-heavy workloads.

```bash
sudo iotop
```

- **Key Metrics**:
  - **Disk Read/Write**: High I/O from PostgreSQL indicates query/DB load.
  - **Processes**: Check `postgres` or Python scripts for excessive I/O.
- **Options**: `sudo iotop -o` (only show processes with I/O), `q` to quit.

Run these during peak times (e.g., after starting embeds) to ensure VMs aren't overloaded. If CPU >90% or I/O is high, consider upgrading instances.

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
