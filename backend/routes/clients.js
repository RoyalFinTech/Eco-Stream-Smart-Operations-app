const db = require("../lib/db");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { publicUser } = require("./auth");
const { ValidationError } = require("../lib/validate");
const { audit } = require("../lib/audit");
const { paginate, textFilter } = require("../lib/pagination");

function register(router) {
  // ---------- GET /api/clients (admin/staff) ----------
  // Backward compatible: GET /api/clients with no query params still
  // returns { clients: [...] } exactly as before. Passing ?search=,
  // ?page=, ?pageSize= opts into filtering/paging (used by the admin
  // portal's advanced search and by any future mobile client).
  router.get("/api/clients", authenticate, requireRole("admin", "staff"), async (req, res) => {
    let clients = (await db.collection("users").find({ role: "client" })).map(publicUser);
    clients = textFilter(clients, req.query.search, ["name", "email", "phone", "address"]);
    const { items, paginated, meta } = paginate(clients, req.query);
    sendJSON(res, 200, paginated ? { clients: items, meta } : { clients: items });
  });

  // ---------- POST /api/clients (admin creates a client manually) ----------
  router.post("/api/clients", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const { hashPassword, genId } = require("../lib/auth");
    const { name, email, phone, address } = req.body;
    if (!name || !phone) throw new ValidationError("name and phone are required");
    const users = db.collection("users");
    const tempPassword = Math.random().toString(36).slice(2, 10);
    const client = await users.insert({
      id: genId("u"),
      role: "client",
      status: "active",
      name,
      email: email || "",
      phone,
      address: address || "",
      password: hashPassword(tempPassword),
      createdAt: new Date().toISOString(),
    });
    sendJSON(res, 201, { client: publicUser(client), tempPassword });
  });

  // ---------- PUT /api/clients/:id ----------
  router.put("/api/clients/:id", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const users = db.collection("users");
    const existing = await users.findById(req.params.id);
    if (!existing || existing.role !== "client") return sendJSON(res, 404, { error: "Client not found" });
    const { name, email, phone, address } = req.body;
    const patch = {};
    if (name) patch.name = name;
    if (email) patch.email = email;
    if (phone) patch.phone = phone;
    if (address !== undefined) patch.address = address;
    const updated = await users.updateById(req.params.id, patch);
    sendJSON(res, 200, { client: publicUser(updated) });
  });

  // ---------- PATCH /api/clients/:id/status  (approve / suspend) ----------
  router.patch("/api/clients/:id/status", authenticate, requireRole("admin"), async (req, res) => {
    const { status } = req.body; // "active" | "suspended" | "pending"
    if (!["active", "suspended", "pending"].includes(status)) {
      throw new ValidationError("status must be active, suspended, or pending");
    }
    const updated = await db.collection("users").updateById(req.params.id, { status });
    if (!updated) return sendJSON(res, 404, { error: "Client not found" });
    await audit(req, "client_status_change", { clientId: req.params.id, status });
    sendJSON(res, 200, { client: publicUser(updated) });
  });

  // ---------- DELETE /api/clients/:id ----------
  router.delete("/api/clients/:id", authenticate, requireRole("admin"), async (req, res) => {
    const ok = await db.collection("users").removeById(req.params.id);
    if (!ok) return sendJSON(res, 404, { error: "Client not found" });
    await audit(req, "client_deleted", { clientId: req.params.id });
    sendJSON(res, 200, { message: "Client deleted" });
  });
}

module.exports = { register };