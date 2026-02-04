# 🌳 bonsai2 — Frontend for Feed Generation

🌳 **Bonsai2** is a React-based feed builder UI that provides two distinct interfaces for creating, customizing, and deploying personalized Bluesky feeds:

1. **Bonsai Classic** — An optimized adaptation of the original [Bonsai system](https://arxiv.org/abs/2509.10776), featuring a structured, section-based interface for precise feed control with visual ranking presets
2. **Bonsai v2** — A conversational, natural language interface that generates feed blueprints from user intent descriptions

Both interfaces integrate with backend feed management APIs, use Bluesky's agent for feed interactions, and leverage **Firebase Firestore** to persist custom feed rulesets for recovery and modification.

---

## Interfaces

### Bonsai Classic

The Classic interface provides a structured approach to feed creation based on the research paper [_Bonsai: Growing Personalized Social Feeds on Bluesky_](https://arxiv.org/abs/2509.10776). This implementation features:

- **Section-based organization**: "Get posts from", "Include posts about", "Limit posts about"
- **Visual ranking presets**: Chronological, Engagement-focused, Relevant, Balanced
- **Feed management**: Multiple saved blueprints with one active feed at a time
- **Inline editing**: Modify topics and sources directly within each section
- **Deterministic conversion**: Maps natural language topics to weighted preferences automatically

### Bonsai v2

The v2 interface offers a conversational approach to feed creation:

- **Natural language input**: Describe your desired feed in plain English
- **AI-powered generation**: Converts intent descriptions into feed blueprints
- **Metadata editing**: Customize display name, description, and other feed properties
- **Direct deployment**: Deploy feeds immediately or save for later

---

## Features

- **Two distinct interfaces**: Classic (structured) and v2 (conversational)
- Intuitive UI for building feed blueprints and editing metadata
- **Acronym detection**: Automatically detects and handles short acronyms (e.g., "CHI", "HCI", "NBA") to avoid false positives from substring matching
- Select and customize sources and ranking options
- Encrypts sensitive data using AES-GCM encryption
- Deploy feeds directly via an API endpoint
- Integration with Bluesky for feed management and liking
- Persist deployed feed blueprints in Firestore for recovery and reuse
- Progress and error handling during deployment
- **Classic-specific**: Feed list management, inline editing, unsaved changes tracking
- **v2-specific**: Natural language intent processing, AI-powered ruleset generation

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

### Bonsai Classic Components

- `BonsaiClassic.js`: Main container managing feed lifecycle (create, save, activate, copy, delete)
- `FeedList.js`: Feed management view with active/inactive status tracking
- `FeedHeader.js`: Editable feed title with save state management
- `SectionOne.js`, `SectionTwo.js`, `SectionThree.js`: Color-coded content sections with inline editing
- `RankingPresets.js`: Visual ranking weight presets
- **localStorage-based persistence**: Feeds stored locally with `isActive` property tracking
- **Blueprint conversion logic**: Maps between Classic UI weights (0.3, 0.65/1.0, 0.75/1.0) and standard API weights (0.5, 0.65/1.0, 0.5/1.0)

### Bonsai v2 Components

- `FeedBuilderUI` component manages feed creation, deployment, and Firestore persistence
- Natural language intent processing via ruleset generator API
- Deployed feed blueprints saved in Firestore for recovery

### Shared Utilities

- `bluesky.js`: Helper functions to fetch user feeds and resolve feed URIs to their respective CIDs
- `crypto.js`: Encryption and decryption utilities using AES-GCM via Web Crypto API
- `firebase.js`: Firestore integration for persistent feed storage
- Environment variables accessed securely via `process.env.REACT_APP_*`

---

## Research

Bonsai Classic is based on the research paper:

**[Bonsai: Growing Personalized Social Feeds on Bluesky](https://arxiv.org/abs/2509.10776)**  
_Optimized implementation with enhanced feed management, caching, and deployment features_
