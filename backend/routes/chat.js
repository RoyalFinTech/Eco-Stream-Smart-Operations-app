const db = require("../lib/db");
const { genId } = require("../lib/auth");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { requireFields } = require("../lib/validate");

function register(router) {
  // ---------- GET /api/chat/conversations (admin/staff — list clients who have messages) ----------
  router.get("/api/chat/conversations", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const all = await db.collection("chatMessages").all();
    const clientIds = [...new Set(all.map((m) => m.clientId))];
    const users = db.collection("users");
    const conversations = await Promise.all(clientIds.map(async (cid) => {
      const client = await users.findById(cid);
      const msgs = all.filter((m) => m.clientId === cid).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const last = msgs[msgs.length - 1];
      return {
        clientId: cid,
        clientName: client ? client.name : "Unknown",
        lastMessage: last ? last.message : "",
        lastAt: last ? last.createdAt : null,
        unread: msgs.filter((m) => m.sender === "client" && !m.read).length,
      };
    }));
    sendJSON(res, 200, { conversations });
  });

  // ---------- GET /api/chat/:clientId (client uses own id implicitly via "me") ----------
  router.get("/api/chat/:clientId", authenticate, async (req, res) => {
    const clientId = req.params.clientId === "me" ? req.user.id : req.params.clientId;
    if (req.user.role === "client" && clientId !== req.user.id) {
      return sendJSON(res, 403, { error: "Forbidden" });
    }
    const messages = (await db.collection("chatMessages").find((m) => m.clientId === clientId))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    // mark company->client messages as read when the client fetches them
    if (req.user.role === "client") {
      for (const m of messages) {
        if (m.sender === "company" && !m.read) await db.collection("chatMessages").updateById(m.id, { read: true });
      }
    }
    sendJSON(res, 200, { messages });
  });

  // ---------- POST /api/chat/:clientId ----------
  router.post("/api/chat/:clientId", authenticate, async (req, res) => {
    const clientId = req.params.clientId === "me" ? req.user.id : req.params.clientId;
    if (req.user.role === "client" && clientId !== req.user.id) {
      return sendJSON(res, 403, { error: "Forbidden" });
    }
    const { message } = req.body;
    requireFields(req.body, ["message"]);
    const sender = req.user.role === "client" ? "client" : "company";
    const msg = await db.collection("chatMessages").insert({
      id: genId("msg"),
      clientId,
      sender,
      senderName: req.user.name,
      message,
      read: false,
      createdAt: new Date().toISOString(),
    });
    sendJSON(res, 201, { message: msg });
  });
}

module.exports = { register };