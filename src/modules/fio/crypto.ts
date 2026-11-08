import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";

type EncryptedToken = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
  fingerprint: string;
};

function encryptionKey() {
  const encoded = process.env.FIO_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("FIO_TOKEN_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("FIO_TOKEN_ENCRYPTION_KEY must be a base64 encoded 32-byte key.");
  }
  return key;
}

function fingerprintKey(key: Buffer) {
  return Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), "klubio-fio-token-fingerprint-v1", 32));
}

export function fioTokenFingerprint(token: string) {
  return createHmac("sha256", fingerprintKey(encryptionKey()))
    .update(token, "utf8")
    .digest("hex");
}

export function encryptFioToken(token: string): EncryptedToken {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("klubio:fio-token:v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: 1,
    fingerprint: fioTokenFingerprint(token),
  };
}

export function decryptFioToken(input: {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}) {
  if (input.keyVersion !== 1) throw new Error("Unsupported Fio token key version.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(input.iv, "base64"),
  );
  decipher.setAAD(Buffer.from("klubio:fio-token:v1", "utf8"));
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
