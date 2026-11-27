import crypto from "node:crypto";

import { getSessionSecret } from "./auth";

function deriveAesKey(): Buffer {
  return crypto.createHash("sha256").update(`geopulse-vault::${getSessionSecret()}`).digest();
}

const PREFIX = "enc:v1:";

export function encryptSecret(plaintext: string): string {
  const clean = plaintext.trim();
  if (!clean) return "";
  if (clean.startsWith(PREFIX)) return clean;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveAesKey(), iv);
  const encrypted = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored) return "";
  if (!stored.startsWith(PREFIX)) {
    // Backwards-compatible for legacy unencrypted values
    return stored;
  }
  try {
    const body = stored.slice(PREFIX.length);
    const [ivHex, tagHex, dataHex] = body.split(":");
    if (!ivHex || !tagHex || !dataHex) return "";
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      deriveAesKey(),
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}
