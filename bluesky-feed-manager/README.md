# 🚀 bluesky-feed-manager — Feed Deployment and Maintenance

This guide walks through deploying your ATProto feed generator on a VM with NGINX and SSL, using Python, SQLite, and Waitress.

---

## 1. VM & Network Setup

To run your Bluesky feed manager, you'll need a small Linux VM with a static external IP, DNS pointing to it, and firewall rules allowing web traffic. Below is a recommended setup based on a working configuration deployed on Google Cloud Platform (GCP), though the same approach works on AWS, Azure, DigitalOcean, etc.

---

### 1.1 Create a VM Instance

Choose any cloud provider and create a lightweight virtual machine.

**Recommended VM configuration (example using GCP):**

| Setting                           | Recommended Value                                                     |
| --------------------------------- | --------------------------------------------------------------------- |
| **Name**                          | `bluesky-feed-manager`                                                |
| **Region / Zone**                 | e.g., `us-central1-f`                                                 |
| **Machine Type**                  | `e2-micro` (2 vCPUs, 1 GB RAM) — works well and is free-tier eligible |
| **Boot Disk**                     | Ubuntu **22.04** LTS or Ubuntu **24.04** LTS                          |
| **Disk Size**                     | ~10 GB                                                                |
| **External IP**                   | Static or Ephemeral (Static preferred)                                |
| **Firewall (during VM creation)** | ✔ Allow HTTP, ✔ Allow HTTPS                                           |

This kind of configuration is sufficient for running a Feed Generator service in production.

Once created, your VM will receive:

- An **internal IP** (e.g., `10.128.0.3`)
- An **external IPv4** — **this one is auto-assigned and _ephemeral_** (e.g., `203.0.113.45`)

The ephemeral external IP **can change at any time** (e.g., when the VM stops/starts), so it should **not** be used for DNS.

You will instead create a **static external IP** and assign it to the VM so your feed’s hostname always points to a stable address.

---

### 1.2 Reserve or Assign a Static External IP

To ensure your VM keeps the same public address, reserve a **static external IP** and attach it to the instance.
This static IP will replace the ephemeral one.

Example (placeholder):

```
External IP (static): 35.67.414.20
```

---

### 1.3 Configure DNS for Your Feed Subdomain

In your DNS provider (e.g., GoDaddy, Cloudflare, Namecheap), create an **A record** that points your feed domain to your VM's external IP.

Example DNS records (safe placeholder values):

| Type | Name    | Data (IP)        | Meaning                              |
| ---- | ------- | ---------------- | ------------------------------------ |
| A    | `feeds` | **203.0.113.45** | `feed.example.com` → feed manager VM |

For example:

```
feed.example.com → 203.0.113.45
```

This domain will later be used as your `HOSTNAME` and for your SSL certificate.

---

### 1.4 Create Firewall Rules (Provider Example: GCP)

Your VM must receive inbound traffic on these ports:

| Purpose                    | Port |
| -------------------------- | ---- |
| HTTP (NGINX)               | 80   |
| HTTPS (NGINX + Certbot)    | 443  |
| App Server / API (Uvicorn) | 8000 |

Create an ingress firewall rule:

```
Name: allow-web
Direction: Ingress
Source IP Range: 0.0.0.0/0
Allowed Protocols: tcp:80, tcp:443, tcp:8000
Target: All instances (or apply a network tag)
```

If your cloud provider automatically adds `allow-http` and `allow-https`, you only need to add `tcp:8000`.

---

## 2. Install Dependencies

SSH into your VM and run:

```bash
sudo apt update
sudo apt install uvicorn nginx certbot python3-certbot-nginx python3-pip -y
sudo pip3 install --upgrade --force-reinstall --ignore-installed \
    python-dotenv \
    atproto \
    peewee \
    typing-extensions \
    numpy \
    onnxruntime \
    transformers \
    fastapi \
    uvicorn \
    --break-system-packages
```

_NOTE: Pasting the entire command block above and running it in the terminal takes approximately 10-15 minutes to complete, so feel free to have things run on their own until completeion._

---

## 3. Pull Down the GitHub Repository

Clone this repo into the VM and enter the project directory:

```bash
git clone https://github.com/Princeton-HCI/cos-atproto-pds.git
cd cos-atproto-pds/bluesky-feed-manager
```

---

## 4. Configure Environment Variables

1. Copy the example environment file:

```bash
cp .env.example .env
nano .env
```

2. Set the required variables. Common ones include:

- `HOSTNAME` - Replace `'feed.example.com'` with the actual subdomain you pointed to your VM (e.g., `feeds.princetonhci.social`).
- `CUSTOM_API_URL` - Keep as-is if you're using your existing PDS; otherwise change to the URL of your own API instance.
- `API_KEY` - A secure key you define. Clients must include this key in requests to access the APIs provided by this service.
- Any optional variables your project requires

Save and exit when done.

---

## 5. Run the Server

First, make the server script executable:

```bash
chmod +x run_server.sh
```

Then start the Bluesky feed manager service:

```bash
./run_server.sh start
```

To check whether it's running:

```bash
./run_server.sh status
```

To stop it:

```bash
./run_server.sh stop
```

### **Optional: Run in the foreground to view logs directly**

If you prefer to run the server without backgrounding it (useful for debugging and watching logs live), run Uvicorn manually:

```bash
uvicorn server.app:app --host 0.0.0.0 --port 8000 --reload
```

Either way, you can check for signs of life by heading to a url like this one with your browser: `http://feed.example.com:8000/xrpc/app.bsky.feed.describeFeedGenerator`. If everything has been implemented properly, you should see a response like this:

```json
{
  "encoding": "application/json",
  "body": {
    "did": "did:plc:feed.example.com",
    "feeds": []
  }
}
```

_NOTE: It takes about 2-5 minutes for the servie to start running, so don't be discouraged if signs of life arent immediate. If running the service in the background fails, stop it and start it in the foreground. Once it has initialized successfully, you can cancel the foreground run and restart it in the background; at that point, the service should be properly primed._

---

## 6. Configure NGINX & SSL

Now that your server is running and your domain points to your VM's external IP, you can configure NGINX to handle HTTPS and proxy traffic to the feed manager.

1. Exit out of which working directory you are currently in

```bash
cd ~
```

2. Create NGINX site configuration:

```bash
sudo nano /etc/nginx/sites-available/bluesky-feed-manager
```

Paste:

```nginx
server {
    listen 80;
    server_name <YOUR HOSTNAME>;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. Enable site and test:

```bash
sudo ln -s /etc/nginx/sites-available/bluesky-feed-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

4. Obtain SSL certificate:

```bash
sudo certbot --nginx -d <YOUR HOSTNAME>
```

- It might take a few moments, but you will be prompted to provide some information for setup. After successful setup, SSL certificates are located in:

```
/etc/letsencrypt/live/<YOUR HOSTNAME>/fullchain.pem
/etc/letsencrypt/live/<YOUR HOSTNAME>/privkey.pem
```

_NOTE: Having the https version of your domain working might take a few moments, but you can check for it by going to a url like this one in your browser: `https://feed.example.com`._

---

## 7. Test the Service: Deploy a New Custom Feed (Dynamic Feed Creation)

Once your server is running and NGINX/SSL is configured, you can **create new custom feeds dynamically**—without editing code or restarting the service. This step verifies that your deployment works end-to-end.

---

### Endpoint

```
POST /create_feed
Content-Type: application/json
x-api-key: <your API key>
```

> Important:
> All requests to this endpoint must include your API key in the `x-api-key` header.
> This key is the same one you configured in your `.env` file under `API_KEY`.

Your feed manager will automatically:

1. Authenticate with the ATProto account you provide
2. Publish a new feed generator record
3. Transiently store the feed in SQLite
4. Register it dynamically so it's instantly live
5. Serve the feed immediately from your hostname (e.g., `https://feed.example.com`)

---

### Example Request Body

Here is an example of the JSON body you would POST to this service:

```json
{
  "handle": "<your bluesky handle>",
  "password": "<the app password for the said handle>",
  "hostname": "feed.example.com",
  "record_name": "adorable-pets-feed",
  "display_name": "Adorable Pets",
  "description": "A feed featuring cute and adorable pictures of pets without any bad language or vulgarity.",
  "blueprint": {
    "topics": [
      { "name": "pets", "priority": 1 },
      { "name": "dogs", "priority": 0.9 },
      { "name": "cats", "priority": 0.9 },
      { "name": "puppies", "priority": 0.8 },
      { "name": "kittens", "priority": 0.8 }
    ],
    "filters": {
      "limit_posts_about": [
        "bad language",
        "vulgarity",
        "profanity",
        "offensive content"
      ]
    },
    "ranking_weights": {
      "focused": 0.8,
      "fresh": 0.7,
      "balanced": 0.6,
      "trending": 0.5
    },
    "suggested_accounts": [
      "did:plc:t4q27bc5gswob4zskgcqi4b6",
      "did:plc:pk5nq3gedpdb6xedfeobsm52",
      "did:plc:f4d76fjna5nxqsy2fu6cgmp3",
      "did:plc:gyjeilekf6276652rhhvjs5c",
      "did:plc:xrr5j2okn7ew2zvcwsxus3gb",
      "did:plc:2ho7jhe6opdnsptcxjmrwca2",
      "did:plc:hh7jwr3vgpojfulwekw36zms",
      "did:plc:kptddmrndbfzof3yzmhdg3fq",
      "did:plc:fvzkql2aqtbk7qmqjkoo2lv2"
    ]
  },
  "timestamp": 1763270109926
}
```

---

### Example cURL Command (with API key)

```bash
curl -X POST http://feed.example.com:8000/manage-feed \
  -H "Content-Type: application/json" \
  -H "x-api-key: <your api key>" \
  -d '{
    "handle": "<your bluesky handle>",
    "password": "<the app password for the said handle>",
    "hostname": "feed.example.com",
    "record_name": "adorable-pets-feed",
    "display_name": "Adorable Pets",
    "description": "A feed featuring cute and adorable pictures of pets without any bad language or vulgarity.",
    "blueprint": {
      "topics": [
        { "name": "pets", "priority": 1 },
        { "name": "dogs", "priority": 0.9 },
        { "name": "cats", "priority": 0.9 },
        { "name": "puppies", "priority": 0.8 },
        { "name": "kittens", "priority": 0.8 }
      ],
      "filters": {
        "limit_posts_about": [
          "bad language",
          "vulgarity",
          "profanity",
          "offensive content"
        ]
      },
      "ranking_weights": {
        "focused": 0.8,
        "fresh": 0.7,
        "balanced": 0.6,
        "trending": 0.5
      },
      "suggested_accounts": [
        "did:plc:t4q27bc5gswob4zskgcqi4b6",
        "did:plc:pk5nq3gedpdb6xedfeobsm52",
        "did:plc:f4d76fjna5nxqsy2fu6cgmp3",
        "did:plc:gyjeilekf6276652rhhvjs5c",
        "did:plc:xrr5j2okn7ew2zvcwsxus3gb",
        "did:plc:2ho7jhe6opdnsptcxjmrwca2",
        "did:plc:hh7jwr3vgpojfulwekw36zms",
        "did:plc:kptddmrndbfzof3yzmhdg3fq",
        "did:plc:fvzkql2aqtbk7qmqjkoo2lv2"
      ]
    },
    "timestamp": 1763270109926
  }'
```

---

### Example Response

If successful, the server returns the feed URI:

```json
{
  "uri": "at://did:plc:feed.example.com/app.bsky.feed.generator/adorable-pets-feed"
}
```

You should then be able to see an identifier for the new feed if you go to that same link from before in your browser: `http://feed.example.com:8000/xrpc/app.bsky.feed.describeFeedGenerator`. If everything has been implemented properly, you should see a response like this now:

```json
{
  "encoding": "application/json",
  "body": {
    "did": "did:web:feeds.princetonhci.social",
    "feeds": [
      {
        "uri": "at://did:plc:s7vox5mkocey4jsf2cvaaptw/app.bsky.feed.generator/adorable-pets-feed"
      }
    ]
  }
}
```

You can also go to a link like this in your browser: `http://feeds.princetonhci.social:8000/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://did:plc:s7vox5mkocey4jsf2cvaaptw/app.bsky.feed.generator/adorable-pets-feed`. This will allow you to actually see the identifiers for handful of posts that have been dynamically collected for your new custom feed.

```json
{
  "cursor": "1763277076",
  "feed": [
    {
      "post": "at://did:plc:6nqex5psu2kg2yzqhzhq6d7b/app.bsky.feed.post/3m5q5mlcfkk2u"
    },
    {
      "post": "at://did:plc:umkdmppnmbfkz65p3xdwxyjc/app.bsky.feed.post/3m5q56dliac23"
    },
    {
      "post": "at://did:plc:6nqex5psu2kg2yzqhzhq6d7b/app.bsky.feed.post/3m5q5kdj6ss2u"
    },
    {
      "post": "at://did:plc:6nqex5psu2kg2yzqhzhq6d7b/app.bsky.feed.post/3m5q5e7g24s2u"
    },
    {
      "post": "at://did:plc:6nqex5psu2kg2yzqhzhq6d7b/app.bsky.feed.post/3m5q4qe7fy22u"
    },
    {
      "post": "at://did:plc:6nqex5psu2kg2yzqhzhq6d7b/app.bsky.feed.post/3m5q4kzall22u"
    },
    {
      "post": "at://did:plc:6nqex5psu2kg2yzqhzhq6d7b/app.bsky.feed.post/3m5q4gnz3fk2w"
    },
    {
      "post": "at://did:plc:6nqex5psu2kg2yzqhzhq6d7b/app.bsky.feed.post/3m5q3roacw22w"
    },
    {
      "post": "at://did:plc:nfqdyxg7k5e4xlsyeaaqbitb/app.bsky.feed.post/3m5q2bjbgoc2j"
    },
    {
      "post": "at://did:plc:fvzkql2aqtbk7qmqjkoo2lv2/app.bsky.feed.post/3m5pdiwpeg22n"
    }
  ]
}
```

Lastly, you can actually see the new custom feed on the Bluesky website by going to a link like this one: `https://bsky.app/profile/did:plc:s7vox5mkocey4jsf2cvaaptw/feed/adorable-pets-feed`.

---

## Congratulations! 🎉 Your service is now creating fully dynamic, on-demand Bluesky feeds.

With a single API call, you can:

- Instantly publish a new custom feed to Bluesky
- Share its URL with anyone
- See it start ranking posts immediately based on your blueprint

No code changes. No redeploys. Fully dynamic.
