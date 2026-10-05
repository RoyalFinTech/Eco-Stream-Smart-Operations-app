const db = require("../lib/db");
const { genId } = require("../lib/auth");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { requireFields } = require("../lib/validate");

function register(router) {
  // ---------- GET /api/notifications ----------
  router.get("/api/notifications", authenticate, async (req, res) => {
    const all = await db.collection("notifications").all();
    const visible =
      req.user.role === "client"
        ? all.filter((n) => n.userId === req.user.id)
        : all; // admin/staff see system-wide notifications
    sendJSON(res, 200, { notifications: visible.sort((a, b) => (a.date < b.date ? 1 : -1)) });
  });

  // ---------- POST /api/notifications (admin/staff broadcast or target a user) ----------
  router.post("/api/notifications", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const { userId, type, title, message } = req.body;
    requireFields(req.body, ["title", "message"]);
    const notification = await db.collection("notifications").insert({
      id: genId("n"),
      userId: userId || null, // null = system-wide (admin dashboard)
      type: type || "system",
      title,
      message,
      read: false,
      date: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    });
    sendJSON(res, 201, { notification });
  });

  // ---------- PATCH /api/notifications/:id/read ----------
  router.patch("/api/notifications/:id/read", authenticate, async (req, res) => {
    const updated = await db.collection("notifications").updateById(req.params.id, { read: true });
    if (!updated) return sendJSON(res, 404, { error: "Notification not found" });
    sendJSON(res, 200, { notification: updated });
  });
}

module.exports = { register };