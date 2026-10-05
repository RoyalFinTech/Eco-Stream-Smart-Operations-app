const db = require("../lib/db");
const { getRequestDb } = require("../lib/requestDb");
const { genId } = require("../lib/auth");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { requireFields } = require("../lib/validate");

function register(router) {
  const provider = () => String(process.env.AUTH_PROVIDER || "json").toLowerCase();
  const database = (req) => getRequestDb(req);
  const userTable = () => provider() === "supabase" ? "profiles" : "users";

  router.get("/api/chat/conversations", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const all = await database(req).collection("chat_messages").all();
    const clientIds = [...new Set(all.map((m) => m.clientId))];
    const users = database(req).collection(userTable());
    const conversations = await Promise.all(clientIds.map(async (cid) => {
      const client = await users.findById(cid);
      const msgs = all.filter((m) => m.clientId === cid).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
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

  router.get("/api/chat/:clientId", authenticate, async (req, res) => {
    const clientId = req.params.clientId === "me" ? req.user.id : req.params.clientId;
    if (req.user.role === "client" && clientId !== req.user.id) return sendJSON(res, 403, { error: "Forbidden" });
    const messages = (await database(req).collection("chat_messages").find({ clientId }))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    if (req.user.role === "client") {
      for (const m of messages) {
        if (m.sender === "company" && !m.read) await database(req).collection("chat_messages").updateById(m.id, { read: true });
      }
    }
    sendJSON(res, 200, { messages });
  });

  router.post("/api/chat/:clientId", authenticate, async (req, res) => {
    const clientId = req.params.clientId === "me" ? req.user.id : req.params.clientId;
    if (req.user.role === "client" && clientId !== req.user.id) return sendJSON(res, 403, { error: "Forbidden" });
    const { message } = req.body;
    requireFields(req.body, ["message"]);
    const sender = req.user.role === "client" ? "client" : "company";
    const record = { clientId, sender, senderName: req.user.name, message, read: false, createdAt: new Date().toISOString() };
    if (provider() !== "supabase") record.id = genId("msg");
    const msg = await database(req).collection("chat_messages").insert(record);
    sendJSON(res, 201, { message: msg });
  });
}

module.exports = { register };