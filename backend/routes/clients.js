const db = require("../lib/db");
const { getRequestDb } = require("../lib/requestDb");
const supabaseAuth = require("../lib/supabaseAuth");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { publicUser } = require("./auth");
const { ValidationError } = require("../lib/validate");
const { audit } = require("../lib/audit");
const { paginate, textFilter } = require("../lib/pagination");

function isSupabase() { return String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase"; }
function register(router) {
  router.get("/api/clients", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const database = getRequestDb(req);
    let clients = (await database.collection(isSupabase() ? "profiles" : "users").find({ role: "client" })).map(publicUser);
    if (isSupabase()) {
      const authUsers = await supabaseAuth.adminListUsers();
      const emailById = new Map(authUsers.map((u) => [u.id, u.email || ""]));
      clients = clients.map((client) => ({ ...client, email: emailById.get(client.id) || "" }));
    }
    const filtered = textFilter(clients, req.query.search, ["name", "email", "phone", "address"]);
    const { items, paginated, meta } = paginate(filtered, req.query);
    sendJSON(res, 200, paginated ? { clients: items, meta } : { clients: items });
  });

  router.post("/api/clients", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const { name, email, phone, address } = req.body;
    if (!name || !phone) throw new ValidationError("name and phone are required");
    if (isSupabase()) {
      if (!email || !String(email).trim()) throw new ValidationError("email is required when Supabase Auth is enabled");
      const tempPassword = Math.random().toString(36).slice(2, 10) + "A1!";
      let authUser;
      try {
        authUser = await supabaseAuth.adminCreateUser({ email: String(email).toLowerCase(), password: tempPassword, data: { name, phone, role: "client" } });
        const client = await getRequestDb(req).collection("profiles").updateById(authUser.id, { role: "client", status: "active", name, phone, address: address || "" });
        if (!client) throw Object.assign(new Error("Supabase Auth user was created but profile provisioning failed"), { status: 502 });
        await audit(req, "client_created", { clientId: authUser.id });
        return sendJSON(res, 201, { client: publicUser({ ...client, email: authUser.email }), tempPassword });
      } catch (err) {
        if (authUser?.id) { try { await supabaseAuth.adminDeleteUser(authUser.id); } catch {} }
        throw err;
      }
    }
    const { hashPassword, genId } = require("../lib/auth");
    const users = db.collection("users");
    const tempPassword = Math.random().toString(36).slice(2, 10);
    const client = await users.insert({ id: genId("u"), role: "client", status: "active", name, email: email || "", phone, address: address || "", password: hashPassword(tempPassword), createdAt: new Date().toISOString() });
    sendJSON(res, 201, { client: publicUser(client), tempPassword });
  });

  router.put("/api/clients/:id", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const users = getRequestDb(req).collection(isSupabase() ? "profiles" : "users");
    const existing = await users.findById(req.params.id);
    if (!existing || existing.role !== "client") return sendJSON(res, 404, { error: "Client not found" });
    const { name, email, phone, address } = req.body;
    if (isSupabase() && email) {
      const authUser = await supabaseAuth.adminGetUser(req.params.id);
      if (String(email).toLowerCase() !== String(authUser.email || "").toLowerCase()) {
        await supabaseAuth.adminUpdateUser(req.params.id, { email: String(email).toLowerCase(), email_confirm: true });
      }
    }
    const patch = {};
    if (name) patch.name = name;
    if (phone) patch.phone = phone;
    if (address !== undefined) patch.address = address;
    if (!isSupabase() && email) patch.email = email;
    const updated = await users.updateById(req.params.id, patch);
    const finalEmail = isSupabase() ? (await supabaseAuth.adminGetUser(req.params.id)).email : updated.email;
    sendJSON(res, 200, { client: publicUser({ ...updated, email: finalEmail }) });
  });

  router.patch("/api/clients/:id/status", authenticate, requireRole("admin"), async (req, res) => {
    const { status } = req.body;
    if (!["active", "suspended", "pending"].includes(status)) throw new ValidationError("status must be active, suspended, or pending");
    const updated = await getRequestDb(req).collection(isSupabase() ? "profiles" : "users").updateById(req.params.id, { status });
    if (!updated) return sendJSON(res, 404, { error: "Client not found" });
    await audit(req, "client_status_change", { clientId: req.params.id, status });
    sendJSON(res, 200, { client: publicUser(updated) });
  });

  router.delete("/api/clients/:id", authenticate, requireRole("admin"), async (req, res) => {
    if (isSupabase()) {
      const profile = await getRequestDb(req).collection("profiles").findById(req.params.id);
      if (!profile || profile.role !== "client") return sendJSON(res, 404, { error: "Client not found" });
      await supabaseAuth.adminDeleteUser(req.params.id);
    } else {
      const ok = await db.collection("users").removeById(req.params.id);
      if (!ok) return sendJSON(res, 404, { error: "Client not found" });
    }
    await audit(req, "client_deleted", { clientId: req.params.id });
    sendJSON(res, 200, { message: "Client deleted" });
  });
}
module.exports = { register };