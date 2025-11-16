export const getEncryptionKey = async () => {
  const secret = process.env.REACT_APP_SECRET_KEY;
  if (!secret) throw new Error("Missing REACT_APP_SECRET_KEY in .env");

  const rawKey = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret)
  );

  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
};

export const encrypt = async (text) => {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text)
  );

  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encryptedBuffer)),
  };
};

export const decrypt = async ({ iv, data }) => {
  const key = await getEncryptionKey();

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    new Uint8Array(data)
  );

  return new TextDecoder().decode(decryptedBuffer);
};
