# 📘 bluesky-pds — Personal Data Server with Embeddings

This guide walks you through setting up a self-hosted Bluesky PDS that ingests data from the ATProto firehose and exposes a FastAPI-powered search API. It uses Google Cloud Platform (GCP), Python, and Caddy for HTTPS proxying.

---

## 1. Create a GCP VM

**Settings:**

- OS: Ubuntu 24.04 LTS
- Machine Type: `e2-small`
- Storage: 40GB
- Enable: HTTP & HTTPS traffic

---

## 2. Set Up Firewall Rule

1. Go to **VPC Network > Firewall Rules**.
2. Click **Create Firewall Rule**.
3. Set:
   - **Name**: `allow-web`
   - **Targets**: Apply to specific instances (select your VM)
   - **Source IP ranges**: `0.0.0.0/0`
   - **Protocols and Ports**: `tcp:80,443,8000`

---

## 3. Assign Static External IP

1. Go to **VPC Network > External IP addresses**.
2. Reserve a static IP.
3. Assign it to your VM.

---

## 4. Create Cloud SQL (PostgreSQL 17)

**Settings:**

- Edition: Enterprise
- Region/Zone: Choose close to your VM
- Configuration:
  - Storage: 10GB SSD
  - vCPU: 1
  - Memory: 1.7 GB
  - Enable Public IP
- Add your VM’s external IP to **Authorized Networks**

---

### Create Database, User, and Password

1. In the **Cloud SQL console**, go to your new PostgreSQL instance.
2. Under **Users**, click **Create User Account**:
   - **Username**: e.g. `pds_user`
   - **Password**: choose a strong password (you’ll put this in your `.env` later)
3. Under **Databases**, click **Create Database**:
   - **Database name**: e.g. `pds_db`
   - Leave other settings default.
4. Your instance now has:
   - Host/IP: `<your-instance-public-ip>`
   - Database: `pds_db`
   - User: `pds_user`
   - Password: `<your-password>`
5. In Connections, add the VM from earlier with its external IP address to Authorized Networks.

---

### Test Connection from VM

SSH into your VM and install `psql`:

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
sudo apt install -y python3-pip

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
    --break-system-packages
```

---

## 8. PDS Embeddings-Powered Search API + Python Scripts

This repository comes bundled with a full suite of Python scripts designed to make interacting with your PDS (Personal Data Server) seamless and powerful. These scripts leverage embeddings-based search, enabling you to perform advanced, semantic queries across your feeds and data—far beyond simple keyword matching. Simply clone the repo and navigate into the project directory to access them:

```bash
git clone https://github.com/Princeton-HCI/cos-atproto-pds.git
cd cos-atproto-pds/bluesky-pds
```

The files included are:

- `debug.py` — for basic connection checks
- `ingest.py` — for firehose ingestion
- `prune.py` — to clean older posts out of the Cloud SQL database
- `api.py` — FastAPI-based search API

It is imparitive to run each script manually in the order listed above to ensure the service is working properly.

Before running them however, update the example .env file in a text editor:

```bash
cp .env.example .env
nano .env
```

- `DB_HOST` – The IP (public or private) of your Cloud SQL instance from the setup steps.
- `DB_PORT` – Usually `5432` for PostgreSQL (set when you created the database).
- `DB_NAME` – The database name you created in Cloud SQL.
- `DB_USER` – The database user you created during the DB setup.
- `DB_PASSWORD` – The password for the DB user you set in the earlier steps.

Once all the environment variables are in place, run the four python scripts.

---

## 9. Shell Scripts to Manage Services

The repository also includes shell scripts to perpetually run each service in the background:

- `run_ingest.sh`
- `run_prune.sh`
- `run_api.sh`

Make the scripts executable:

```bash
chmod +x run_*.sh
```

Run them as needed:

```bash
./run_ingest.sh start
./run_prune.sh start
./run_api.sh start
```

---

## 10. Set Up Caddy Proxy

Your PDS likely already uses Caddy via Docker.

### Find Caddy Container:

```bash
sudo docker ps
```

Look for the container running the `caddy:2` image.

### Locate the Caddyfile:

Caddy config is mounted, often at:

```bash
/pds/caddy/etc/caddy/Caddyfile
```

Edit it:

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

## ✅ Done

You now have a working:

- ATProto PDS
- Firehose ingester
- Pruning script
- FastAPI-powered search API
- Reverse proxy via Caddy

You can now build richer services on top of your self-hosted Bluesky data.
