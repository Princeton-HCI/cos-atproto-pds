export const fetchUserFeeds = async (did) => {
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getActorFeeds?actor=${did}`
    );
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data.feeds || [];
  } catch (err) {
    console.error("Failed to fetch feeds:", err);
    return [];
  }
};

export const getFeedByUri = (feeds, uri) => {
  return feeds.find((feed) => feed.uri === uri) || null;
};

export const extractHandleOrDid = (input) => {
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

export const resolveDidFromHandleOrDid = async (identifier) => {
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

export const getProfile = async (handleOrDid) => {
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${handleOrDid}`
    );

    if (!res.ok) return null;

    const data = await res.json();
    return {
      handle: data.handle,
      did: data.did,
      displayName: data.displayName,
      avatar: data.avatar,
    };
  } catch (err) {
    console.error("Failed to fetch profile:", handleOrDid, err);
    return null;
  }
};
