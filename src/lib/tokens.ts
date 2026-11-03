import { createHash, createHmac, randomBytes } from "node:crypto";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }

  return secret;
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHmac("sha256", sessionSecret()).update(token).digest("hex");
}

export function hashRateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createHumanCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const characters = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  return `${characters.slice(0, 4).join("")}-${characters.slice(4).join("")}`;
}
