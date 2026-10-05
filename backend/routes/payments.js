const { getRequestDb } = require("../lib/requestDb");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { requireFields, ValidationError } = require("../lib/validate");

function register(router) {
  // ---------- GET /api/payments ----------
  router.get("/api/payments", authenticate, async (req, res) => {
    const all = await getRequestDb(req).collection("payments").all();
    const visible = String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase" ? all : (req.user.role === "client" ? all.filter((p) => p.clientId === req.user.id) : all);
    sendJSON(res, 200, { payments: visible });
  });

  // ---------- POST /api/payments (admin/staff record a payment) ----------
  router.post("/api/payments", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const { clientId, projectId, amount, method } = req.body;
    requireFields(req.body, ["clientId", "amount", "method"]);
    if (typeof amount !== "number" || amount <= 0) throw new ValidationError("amount must be a positive number");
    const payment = await getRequestDb(req).collection("payments").insert({
      clientId,
      projectId: projectId || null,
      amount,
      method,
      status: "paid",
      date: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    });
    sendJSON(res, 201, { payment });
  });

  // ---------- GET /api/invoices (alias over payments — each payment is invoiced) ----------
  router.get("/api/invoices", authenticate, async (req, res) => {
    const all = await getRequestDb(req).collection("payments").all();
    const visible = String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase" ? all : (req.user.role === "client" ? all.filter((p) => p.clientId === req.user.id) : all);
    const invoices = visible.map((p) => ({ ...p, invoiceNumber: "INV-" + p.id.slice(-6).toUpperCase() }));
    sendJSON(res, 200, { invoices });
  });

  // ---------- POST /api/invoices (create an unpaid invoice ahead of payment) ----------
  router.post("/api/invoices", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const { clientId, projectId, amount, method } = req.body;
    requireFields(req.body, ["clientId", "amount"]);
    const invoice = await getRequestDb(req).collection("payments").insert({
      clientId,
      projectId: projectId || null,
      amount,
      method: method || "Not specified",
      status: "pending",
      date: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    });
    sendJSON(res, 201, { invoice: { ...invoice, invoiceNumber: "INV-" + invoice.id.slice(-6).toUpperCase() } });
  });
}

module.exports = { register };