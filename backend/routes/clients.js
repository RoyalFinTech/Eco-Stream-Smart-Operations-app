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
    const filtered = textFilter(clients, req.query.search, ["name", "phone", "address"]);
    const { items, paginated, meta } = paginate(filtered, req.query);
    sendJSON(res, 200, paginated ? { clients: items, meta } : { clients: items });
  });

  router.post("/api/clients", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const { name, phone, pin, address } = req.body;
    if (!name || !phone) throw new ValidationError("name and phone are required");
    if (isSupabase()) {
      if (!pin || !/^\d{6}$/.test(String(pin))) throw new ValidationError("A 6-digit PIN is required");
      let authUser;
      try {
        authUser = await supabaseAuth.adminCreateUser({ email: supabaseAuth.internalAuthEmail(phone), password: String(pin), emailConfirmed: true, data: { name, phone, role: "client" } });
        const client = await getRequestDb(req).collection("profiles").updateById(authUser.id, { role: "client", status: "active", name, phone, address: address || "" });
        if (!client) throw Object.assign(new Error("Supabase Auth user was created but profile provisioning failed"), { status: 502 });
        await audit(req, "client_created", { clientId: authUser.id });
        return sendJSON(res, 201, { client: publicUser({ ...client, phone: authUser.phone || client.phone }) });
      } catch (err) {
        if (authUser?.id) { try { await supabaseAuth.adminDeleteUser(authUser.id); } catch {} }
        throw err;
      }
    }
    const { hashPassword, genId } = require("../lib/auth");
    const users = db.collection("users");
    const localPin = /^\d{6}$/.test(String(pin || "")) ? String(pin) : Math.floor(100000 + Math.random() * 900000).toString();
    const client = await users.insert({ id: genId("u"), role: "client", status: "active", name, email: "", phone, address: address || "", password: hashPassword(localPin), createdAt: new Date().toISOString() });
    sendJSON(res, 201, { client: publicUser(client), tempPin: localPin });
  });

  router.put("/api/clients/:id", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const users = getRequestDb(req).collection(isSupabase() ? "profiles" : "users");
    const existing = await users.findById(req.params.id);
    if (!existing || existing.role !== "client") return sendJSON(res, 404, { error: "Client not found" });
    const { name, phone, address } = req.body;
        const patch = {};
    if (name) patch.name = name;
    if (phone) {
      patch.phone = supabaseAuth.normalizePhone(phone);
      if (isSupabase()) await supabaseAuth.adminUpdatePhoneIdentity(req.params.id, patch.phone);
    }
    if (address !== undefined) patch.address = address;
        const updated = await users.updateById(req.params.id, patch);
    sendJSON(res, 200, { client: publicUser(updated) });
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