const db = require("./db");
const { genId } = require("./auth");

async function audit(req, action, details = {}) {
  const actor = req && req.user ? req.user : (req && req.id ? req : null);
  await db.collection("auditLogs").insert({
    id: genId("log"),
    actorId: actor ? actor.id : null,
    actorName: actor ? actor.name : "anonymous",
    actorRole: actor ? actor.role : null,
    action,
    details,
    ip: req && req.socket ? req.socket.remoteAddress : null,
    date: new Date().toISOString(),
  });
}
module.exports = { audit };