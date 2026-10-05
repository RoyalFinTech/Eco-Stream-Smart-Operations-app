const db = require("../lib/db");
const { genId } = require("../lib/auth");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { requireFields, ValidationError } = require("../lib/validate");

function register(router) {
  // ---------- GET /api/equipment ----------
  router.get("/api/equipment", authenticate, requireRole("admin", "staff"), async (req, res) => {
    sendJSON(res, 200, { equipment: await db.collection("equipment").all() });
  });

  // ---------- POST /api/equipment ----------
  router.post("/api/equipment", authenticate, requireRole("admin"), async (req, res) => {
    const { type, name } = req.body;
    requireFields(req.body, ["type", "name"]);
    const item = await db.collection("equipment").insert({
      id: genId("eq"),
      type,
      name,
      status: "active",
      lastMaintenance: null,
      createdAt: new Date().toISOString(),
    });
    sendJSON(res, 201, { equipment: item });
  });

  // ---------- PUT /api/equipment/:id ----------
  router.put("/api/equipment/:id", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const { status, lastMaintenance, name } = req.body;
    const patch = {};
    if (status) patch.status = status;
    if (lastMaintenance) patch.lastMaintenance = lastMaintenance;
    if (name) patch.name = name;
    const updated = await db.collection("equipment").updateById(req.params.id, patch);
    if (!updated) return sendJSON(res, 404, { error: "Equipment not found" });
    sendJSON(res, 200, { equipment: updated });
  });

  // ---------- DELETE /api/equipment/:id ----------
  router.delete("/api/equipment/:id", authenticate, requireRole("admin"), async (req, res) => {
    const ok = await db.collection("equipment").removeById(req.params.id);
    if (!ok) return sendJSON(res, 404, { error: "Equipment not found" });
    sendJSON(res, 200, { message: "Equipment removed" });
  });

  // ---------- GET /api/expenses (fuel logs, maintenance costs, etc.) ----------
  router.get("/api/expenses", authenticate, requireRole("admin", "staff"), async (req, res) => {
    sendJSON(res, 200, { expenses: await db.collection("expenses").all() });
  });

  // ---------- POST /api/expenses ----------
  router.post("/api/expenses", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const { category, amount, note } = req.body;
    requireFields(req.body, ["category", "amount"]);
    if (typeof amount !== "number" || amount <= 0) throw new ValidationError("amount must be a positive number");
    const expense = await db.collection("expenses").insert({
      id: genId("ex"),
      category,
      amount,
      note: note || "",
      date: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    });
    sendJSON(res, 201, { expense });
  });
}

module.exports = { register };