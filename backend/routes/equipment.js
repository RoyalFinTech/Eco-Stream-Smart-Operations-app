const db = require("../lib/db");
const { getRequestDb } = require("../lib/requestDb");
const { genId } = require("../lib/auth");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { requireFields, ValidationError } = require("../lib/validate");

function register(router) {
  const provider = () => String(process.env.AUTH_PROVIDER || "json").toLowerCase();
  const database = (req) => getRequestDb(req);

  router.get("/api/equipment", authenticate, requireRole("admin", "staff"), async (req, res) => {
    sendJSON(res, 200, { equipment: await database(req).collection("equipment").all() });
  });

  router.post("/api/equipment", authenticate, requireRole("admin"), async (req, res) => {
    const { type, name } = req.body;
    requireFields(req.body, ["type", "name"]);
    const record = { type, name, status: "active", lastMaintenance: null, createdAt: new Date().toISOString() };
    if (provider() !== "supabase") record.id = genId("eq");
    const item = await database(req).collection("equipment").insert(record);
    sendJSON(res, 201, { equipment: item });
  });

  router.put("/api/equipment/:id", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const { status, lastMaintenance, name } = req.body;
    const patch = {};
    if (status) patch.status = status;
    if (lastMaintenance) patch.lastMaintenance = lastMaintenance;
    if (name) patch.name = name;
    const updated = await database(req).collection("equipment").updateById(req.params.id, patch);
    if (!updated) return sendJSON(res, 404, { error: "Equipment not found" });
    sendJSON(res, 200, { equipment: updated });
  });

  router.delete("/api/equipment/:id", authenticate, requireRole("admin"), async (req, res) => {
    const ok = await database(req).collection("equipment").removeById(req.params.id);
    if (!ok) return sendJSON(res, 404, { error: "Equipment not found" });
    sendJSON(res, 200, { message: "Equipment removed" });
  });

  router.get("/api/expenses", authenticate, requireRole("admin", "staff"), async (req, res) => {
    sendJSON(res, 200, { expenses: await database(req).collection("expenses").all() });
  });

  router.post("/api/expenses", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const { category, amount, note } = req.body;
    requireFields(req.body, ["category", "amount"]);
    if (typeof amount !== "number" || amount <= 0) throw new ValidationError("amount must be a positive number");
    const record = { category, amount, note: note || "", date: new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString() };
    if (provider() !== "supabase") record.id = genId("ex");
    const expense = await database(req).collection("expenses").insert(record);
    sendJSON(res, 201, { expense });
  });
}

module.exports = { register };
