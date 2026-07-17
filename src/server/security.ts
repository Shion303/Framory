import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date;
}

export function assertRateLimit(key: string, limit = 8, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) {
    throw new Error("Troppi tentativi. Riprova più tardi.");
  }
  current.count += 1;
}
