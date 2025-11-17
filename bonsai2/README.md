# 🌳 bonsai2 — Frontend for Feed Generation

🌳 **Bonsai2** is a React-based feed builder UI that allows users to create, customize, and deploy personalized feeds with ease. This project integrates with a backend feed management API, uses Bluesky's agent for interacting with feeds, and leverages **Firebase Firestore** to persist custom feed rulesets so users can recover or tweak previously deployed feeds.

---

## Features

- Intuitive UI for building feed blueprints and editing metadata
- Select and customize sources and ranking options
- Encrypts sensitive data using AES-GCM encryption
- Deploy feeds directly via an API endpoint
- Integration with Bluesky for feed management and liking
- Persist deployed feed blueprints in Firestore for recovery and reuse
- Progress and error handling during deployment

---

## Environment Variables

Create a `.env` file in the root of your project based on `.env.example` with your actual credentials:

```env
# API key for authenticating requests to the feed management backend
REACT_APP_FEED_API_KEY=your_actual_api_key_here

# Secret key used for AES-GCM encryption and decryption of sensitive data
REACT_APP_SECRET_KEY=your_actual_encryption_secret_key_here

# Bluesky feed ruleset generator service API endpoint
REACT_APP_BLUESKY_FEED_RULESET_GENERATOR_API=https://bluesky-feed-ruleset-generator-123456789000.us-central1.run.app/api/generate-feed-ruleset

# Bluesky feed manager service API endpoint
REACT_APP_BLUESKY_FEED_MANAGER_API=https://feed.example.com/manage-feed

# Firebase configuration
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key_here
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_FIREBASE_MEASUREMENT_ID=your_measurement_id
REACT_APP_FIREBASE_FIRESTORE_COLLECTION=your_firestore_collection_name
```

- `REACT_APP_FEED_API_KEY`: API key for authenticating requests to the feed management backend.
- `REACT_APP_SECRET_KEY`: Secret key used for AES-GCM encryption and decryption of sensitive data.
- `REACT_APP_BLUESKY_FEED_MANAGER_API`: Endpoint for deploying feeds via the feed manager service.
- `REACT_APP_FIREBASE_*`: Firebase project configuration. Firestore is used to store deployed feed blueprints for recovery.
- `REACT_APP_FIREBASE_FIRESTORE_COLLECTION`: Name of the Firestore collection where deployed feed blueprints are stored.

---

## Firebase Firestore Integration

Bonsai2 persists deployed feeds in **Firestore** to allow users to:

- Recover old feed rulesets
- Tweak previously deployed feeds
- Re-deploy feeds without starting from scratch

When a feed is deployed via the backend API, the app saves the feed blueprint and metadata in Firestore under the configured collection. Each document contains:

- `feedUri`: The unique Bluesky feed URI
- `feedBlueprint`: The full blueprint used for deployment
- `feedMetadata`: Display name, description, and other metadata
- `timestamp`: When the feed was deployed

This ensures users can always revisit their custom feeds and regenerate them.

---

## Getting Started

1. Clone the repo:

   ```bash
   git clone https://github.com/Princeton-HCI/cos-atproto-pds.git
   cd cos-atproto-pds/bonsai2
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Add your environment variables in `.env`.

4. Run the development server:

   ```bash
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000) to view the app in the browser.

---

## Deployment

### Deploy to Firebase Cloud Hosting

You can easily deploy Bonsai2 to Firebase Cloud Hosting:

1. Install Firebase CLI if you haven't already:

   ```bash
   npm install -g firebase-tools
   ```

2. Log in to Firebase:

   ```bash
   firebase login
   ```

3. Initialize Firebase in your project (choose Hosting):

   ```bash
   firebase init
   ```

4. Build your React app:

   ```bash
   npm run build
   ```

5. Deploy to Firebase:

   ```bash
   firebase deploy
   ```

Your app will be available on the Firebase hosting URL provided after deployment.

---

## Code Highlights

- The `FeedBuilderUI` component manages feed creation, deployment, and Firestore persistence.
- `bluesky.js` contains helper functions to fetch user feeds and resolve feed URIs to their respective CIDs.
- Deployed feed blueprints are saved in Firestore so users can recover and tweak them.
- Encryption and decryption utilities use AES-GCM via Web Crypto API.
- Environment variables are accessed securely via `process.env.REACT_APP_*`.
