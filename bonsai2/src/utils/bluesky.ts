import { AtpAgent, AtpSessionEvent, AtpSessionData } from "@atproto/api";

let sessionData: AtpSessionData | undefined;

export const agent = new AtpAgent({
  service: "https://bsky.social",
  persistSession: (evt: AtpSessionEvent, sess?: AtpSessionData) => {
    if (evt === "create") {
      sessionData = sess;
      // console.log("Session created:", sessionData);
    } else if (evt === "update") {
      sessionData = sess;
      // console.log("Session updated:", sessionData);
    }
  },
});

export const extractHandleOrDid = (input: string) => {
  input = input.trim();

  // Direct DID
  if (input.startsWith("did:")) return input;

  // URL: https://bsky.app/profile/xxxx
  const match = input.match(/bsky\.app\/profile\/([^\/\s]+)/);
  if (match) return match[1]; // return ONLY what comes after profile/

  // Handle format (.bsky.social)
  if (input.endsWith(".bsky.social")) return input;

  return null;
};

export const resolveDidFromHandleOrDid = async (identifier: string) => {
  try {
    const url = `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${identifier}`;

    const res = await fetch(url);

    if (!res.ok) return null;

    const profile = await res.json();
    return profile.did; // normalized DID
  } catch (err) {
    console.error("Error resolving DID:", err);
    return null;
  }
};
