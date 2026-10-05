// lib/auth.js — zero-dependency auth helpers.
// Password hashing: Node's built-in scrypt (Node's own recommended KDF — no bcrypt needed).
// Tokens: a minimal, real HS256 JWT implementation (header.payload.signature) using crypto.createHmac.

const crypto = require("crypto");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  return "ecostream-local-development-secret";
}

function assertAuthConfig() {
  if (String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase") return;
  if (process.env.NODE_ENV === "production") {
    const secret = process.env.JWT_SECRET || "";
    if (secret.length < 48) {
      throw new Error("JWT_SECRET must be at least 48 characters in production");
    }
    if (!process.env.EMAIL_WEBHOOK_URL) {
      throw new Error("EMAIL_WEBHOOK_URL is required in production");
    }
  }
}
const TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 hours

// ---------- password hashing ----------
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(plain, salt, 64).toString("hex");
  // timing-safe compare
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------- base64url helpers ----------
function b64url(input) {
  return Buffer.from(JSON.stringify(input))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return JSON.parse(Buffer.from(str, "base64").toString("utf8"));
}

// ---------- JWT (HS256) ----------
function signToken(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS };
  const head = b64url(header);
  const pay = b64url(body);
  const sig = crypto
    .createHmac("sha256", getJwtSecret())
    .update(`${head}.${pay}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${head}.${pay}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, pay, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", getJwtSecret())
    .update(`${head}.${pay}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = b64urlDecode(pay);
  } catch {
    return null;
  }
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null; // expired
  return payload;
}

function genId(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function genResetToken() {
  return crypto.randomBytes(24).toString("hex");
}

// ---------- refresh tokens & sessions ----------
// Refresh tokens are opaque random strings (not JWTs) stored server-side —
// hashed, never in plaintext — in the `sessions` collection. This is what
// makes them actually revocable (a stolen access-JWT expires on its own in
// ACCESS_TOKEN_TTL_SECONDS; a stolen refresh token can be revoked immediately
// via DELETE /api/auth/sessions/:id, which a stateless JWT alone can't do).
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function genRefreshToken() {
  return crypto.randomBytes(32).toString("hex");
}
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  hashPassword, verifyPassword, signToken, verifyToken, genId, genResetToken,
  genRefreshToken, hashToken, REFRESH_TOKEN_TTL_MS, assertAuthConfig,
  ACCESS_TOKEN_TTL_SECONDS: TOKEN_TTL_SECONDS,
};