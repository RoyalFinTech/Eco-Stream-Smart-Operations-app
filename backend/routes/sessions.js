const db = require("../lib/db");
const { sendJSON, authenticate } = require("../lib/router");
const { revokeSession } = require("../lib/sessions");
const supabaseAuth = require("../lib/supabaseAuth");

function publicSession(s) {
  const { refreshTokenHash, ...pub } = s;
  return pub;
}

function register(router) {
  router.get("/api/auth/sessions", authenticate, async (req, res) => {
    if (String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase") {
      return sendJSON(res, 200, { sessions: [{ id: "current", device: "Current browser", lastUsedAt: new Date().toISOString() }] });
    }
    const sessions = (await db.collection("sessions").find((s) => s.userId === req.user.id && !s.revoked && new Date(s.expiresAt).getTime() > Date.now()))
      .sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt))).map(publicSession);
    sendJSON(res, 200, { sessions });
  });

  router.delete("/api/auth/sessions/:id", authenticate, async (req, res) => {
    if (String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase") {
      if (req.params.id !== "current") return sendJSON(res, 404, { error: "Session not found" });
      await supabaseAuth.signOut(req.user.accessToken);
      return sendJSON(res, 200, { message: "Current session revoked" });
    }
    const session = await db.collection("sessions").findById(req.params.id);
    if (!session || session.userId !== req.user.id) return sendJSON(res, 404, { error: "Session not found" });
    await revokeSession(session.id);
    sendJSON(res, 200, { message: "Session revoked" });
  });

  router.delete("/api/auth/sessions", authenticate, async (req, res) => {
    if (String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase") {
      await supabaseAuth.signOut(req.user.accessToken);
      return sendJSON(res, 200, { message: "Supabase Auth session revoked" });
    }
    const sessions = await db.collection("sessions").find((s) => s.userId === req.user.id && !s.revoked);
    for (const s of sessions) await revokeSession(s.id);
    sendJSON(res, 200, { message: `Revoked ${sessions.length} session(s)` });
  });
}

module.exports = { register };
