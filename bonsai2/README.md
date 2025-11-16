# 🌳 bonsai2 — Frontend for Feed Generation

🌳 **Bonsai2** is a React-based feed builder UI that allows users to create, customize, and deploy personalized feeds with ease. This project integrates with a backend feed management API and uses Bluesky's agent for interacting with feeds.

---

## Features

- Intuitive UI for building feed blueprints and editing metadata
- Select and customize sources and ranking options
- Encrypts sensitive data using AES-GCM encryption
- Deploy feeds directly via an API endpoint
- Integration with Bluesky for feed management and liking
- Progress and error handling during deployment

---

## Environment Variables

Create a `.env` file in the root of your project based on `.env.example` with your actual credentials:

```env
REACT_APP_FEED_API_KEY=your_actual_api_key_here
REACT_APP_SECRET_KEY=your_actual_encryption_secret_key_here
```

- `REACT_APP_FEED_API_KEY`: API key for authenticating requests to the feed management backend.
- `REACT_APP_SECRET_KEY`: Secret key used for AES-GCM encryption and decryption of sensitive data.

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

- The `FeedBuilderUI` component manages the feed creation flow and calls the backend API to deploy feeds.
- Deployment progress and errors are handled gracefully in the UI.
- Encryption and decryption utilities use the Web Crypto API with AES-GCM.
- Environment variables are accessed securely via `process.env.REACT_APP_*`.
