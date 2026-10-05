const db = require("../lib/db");
const { sendJSON, authenticate } = require("../lib/router");
const { revokeSession } = require("../lib/sessions");

function publicSession(s) {
  const { refreshTokenHash, ...pub } = s;
  return pub;
}

function register(router) {
  // ---------- GET /api/auth/sessions — list this user's active devices ----------
  router.get("/api/auth/sessions", authenticate, async (req, res) => {
    const sessions = (await db.collection("sessions").find((s) => s.userId === req.user.id && !s.revoked && new Date(s.expiresAt).getTime() > Date.now()))
      .sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)))
      .map(publicSession);
    sendJSON(res, 200, { sessions });
  });

  // ---------- DELETE /api/auth/sessions/:id — revoke one device ----------
  router.delete("/api/auth/sessions/:id", authenticate, async (req, res) => {
    const session = await db.collection("sessions").findById(req.params.id);
    if (!session || session.userId !== req.user.id) return sendJSON(res, 404, { error: "Session not found" });
    await revokeSession(session.id);
    sendJSON(res, 200, { message: "Session revoked" });
  });

  // ---------- DELETE /api/auth/sessions — sign out of every device ----------
  router.delete("/api/auth/sessions", authenticate, async (req, res) => {
    const sessions = await db.collection("sessions").find((s) => s.userId === req.user.id && !s.revoked);
    for (const s of sessions) await revokeSession(s.id);
    sendJSON(res, 200, { message: `Revoked ${sessions.length} session(s)` });
  });
}

module.exports = { register };