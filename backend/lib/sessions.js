// lib/sessions.js — device/session tracking backing the refresh-token flow.
const db = require("./db");
const { genId, genRefreshToken, hashToken, REFRESH_TOKEN_TTL_MS } = require("./auth");

function deviceLabel(req) {
  const ua = req.headers["user-agent"] || "Unknown device";
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return "Android device";
  if (/macintosh/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows PC";
  if (/linux/i.test(ua)) return "Linux";
  return ua.slice(0, 60);
}

async function createSession(req, user) {
  const refreshToken = genRefreshToken();
  await db.collection("sessions").insert({
    id: genId("sess"), userId: user.id, refreshTokenHash: hashToken(refreshToken), device: deviceLabel(req),
    ip: req.socket && req.socket.remoteAddress, createdAt: new Date().toISOString(), lastUsedAt: new Date().toISOString(),
    expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS, revoked: false,
  });
  return refreshToken;
}

async function findValidSession(refreshToken) {
  const hash = hashToken(refreshToken);
  const session = await db.collection("sessions").findOne((s) => s.refreshTokenHash === hash && !s.revoked);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;
  return session;
}

async function revokeSession(id) {
  return db.collection("sessions").updateById(id, { revoked: true, revokedAt: new Date().toISOString() });
}

async function rotateSession(oldSession, req) {
  await revokeSession(oldSession.id);
  const refreshToken = genRefreshToken();
  await db.collection("sessions").insert({
    id: genId("sess"), userId: oldSession.userId, refreshTokenHash: hashToken(refreshToken), device: oldSession.device,
    ip: req.socket && req.socket.remoteAddress, createdAt: oldSession.createdAt, lastUsedAt: new Date().toISOString(),
    expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS, revoked: false,
  });
  return refreshToken;
}
module.exports = { createSession, findValidSession, revokeSession, rotateSession };