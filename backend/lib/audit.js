const db = require("./db");
const { getRequestDb } = require("./requestDb");
const { genId } = require("./auth");

async function audit(req, action, details = {}) {
  const actor = req && req.user ? req.user : (req && req.id ? req : null);
  const provider = String(process.env.AUTH_PROVIDER || "json").toLowerCase();
  const database = provider === "supabase" ? getRequestDb(req) : db;
  const table = provider === "supabase" ? "audit_logs" : "auditLogs";
  const record = {
    actorId: actor ? actor.id : null,
    actorName: actor ? actor.name : "anonymous",
    actorRole: actor ? actor.role : null,
    action,
    details,
    ip: req && req.socket ? req.socket.remoteAddress : null,
    date: new Date().toISOString(),
  };
  if (provider !== "supabase") record.id = genId("log");
  await database.collection(table).insert(record);
}
module.exports = { audit };