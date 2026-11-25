import bcrypt from "bcryptjs";

/** Cached PIN hashes are good for offline sign-in for a day after the device last synced (SPEC F2). */
export const PIN_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isPinCacheFresh(updatedAt: number, now = Date.now()): boolean {
  return now - updatedAt < PIN_CACHE_MAX_AGE_MS;
}

/** Checks a PIN against a bcrypt hash from the server (pgcrypto "$2a$" hashes are compatible). */
export function checkPinOffline(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
