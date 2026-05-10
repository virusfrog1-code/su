import crypto from "crypto";

export function createSummonNonce() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  const code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `SUMMON-${code}`;
}

export function nonceExpiry(minutes = 30) {
  return new Date(Date.now() + minutes * 60 * 1000);
}
