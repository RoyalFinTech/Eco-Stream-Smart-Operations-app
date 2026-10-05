// routes/clients.postgres.js
//
// ⚠️ REFERENCE EXAMPLE — not registered in server.js, not runnable without a
// live Postgres connection. This is routes/clients.js rewritten against the
// Postgres repository layer (repositories/index.js) so you have a concrete,
// complete template for converting the rest of routes/*.js. The differences
// from the JSON version, line by line:
//   1. `require("../lib/db")` -> `require("../repositories")`
//   2. every db call gets `await` (Postgres access is inherently async;
//      the JSON file store's calls are synchronous, which is the one
//      structural change migrating requires — see
//      documentation/POSTGRES_MIGRATION.md)
//   3. `.find(u => u.role === "client")` (a JS predicate) becomes
//      `.find({ role: "client" })` (a real Prisma `where` clause, pushed
//      down to SQL instead of filtered in Node) — both forms work against
//      createRepository(), but the object form is the point of migrating.
//   4. route handlers become `async (req, res) => { ... }`
//
// Once you've applied this pattern to every route file, swap the
// `require("../lib/db")` at the top of server.js's route registration for
// `require("../repositories")`, add `await` everywhere those files call it,
// and set DB_DRIVER=postgres.

const db = require("../repositories"); // <-- only this line changes vs. the JSON version
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { publicUser } = require("./auth");
const { ValidationError } = require("../lib/validate");
const { audit } = require("../lib/audit");
const { paginate, textFilter } = require("../lib/pagination");

function register(router) {
  // ---------- GET /api/clients (admin/staff) ----------
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

  // ---------- PATCH /api/clients/:id/status ----------
  router.patch("/api/clients/:id/status", authenticate, requireRole("admin"), async (req, res) => {
    const { status } = req.body;
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