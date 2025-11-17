import { decrypt } from "./crypto";

export const verifyBlueskyLogin = async (handle, password) => {
  try {
    const res = await fetch(
      "https://bsky.social/xrpc/com.atproto.server.createSession",
      {
        method: "POST",
        body: JSON.stringify({ identifier: handle, password }),
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!res.ok) return null;

    const session = await res.json();
    return session;
  } catch (err) {
    console.error("Login error:", err);
    return null;
  }
};

export const getCredentials = async (setCredentials) => {
  const stored = localStorage.getItem("bonsai2-credentials");
  if (!stored) return;

  const parsed = JSON.parse(stored);

  try {
    // decrypt password into memory
    const decryptedPw = await decrypt(parsed.encryptedPw);

    setCredentials({
      handle: parsed.handle,
      password: decryptedPw,
      session: parsed.session,
    });
  } catch (err) {
    console.error("Failed to decrypt credentials:", err);
    localStorage.removeItem("bonsai2-credentials");
  }
};
