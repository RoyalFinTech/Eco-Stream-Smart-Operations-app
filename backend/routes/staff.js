const db = require("../lib/db");
const { getRequestDb } = require("../lib/requestDb");
const supabaseAuth = require("../lib/supabaseAuth");
const { hashPassword, genId } = require("../lib/auth");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { publicUser } = require("./auth");
const { requireFields, ValidationError } = require("../lib/validate");
const { audit } = require("../lib/audit");

function isSupabase() { return String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase"; }
function register(router) {
  router.get("/api/staff", authenticate, requireRole("admin"), async (req, res) => {
    let staff = (await getRequestDb(req).collection(isSupabase() ? "profiles" : "users").find({ role: { in: ["staff", "admin"] } })).map(publicUser);
    if (isSupabase()) {
      const authUsers = await supabaseAuth.adminListUsers();
      const emailById = new Map(authUsers.map((u) => [u.id, u.email || ""]));
      staff = staff.map((member) => ({ ...member, email: emailById.get(member.id) || "" }));
    }
    sendJSON(res, 200, { staff });
  });

  router.post("/api/staff", authenticate, requireRole("admin"), async (req, res) => {
    const { name, email, phone, staffRole } = req.body;
    requireFields(req.body, ["name", "email", "phone", "staffRole"]);
    if (!isSupabase()) {
      const users = db.collection("users");
      if (await users.findOne((u) => u.email.toLowerCase() === email.toLowerCase())) throw new ValidationError("An account with this email already exists");
      const tempPassword = Math.random().toString(36).slice(2, 10);
      const member = await users.insert({ id: genId("u"), role: staffRole === "administrator" ? "admin" : "staff", staffRole, name, email: email.toLowerCase(), phone, password: hashPassword(tempPassword), createdAt: new Date().toISOString() });
      return sendJSON(res, 201, { staff: publicUser(member), tempPassword });
    }
    const tempPassword = Math.random().toString(36).slice(2, 10) + "A1!";
    let authUser;
    try {
      const role = staffRole === "administrator" ? "admin" : "staff";
      authUser = await supabaseAuth.adminCreateUser({ email: email.toLowerCase(), password: tempPassword, data: { name, phone, role, staff_role: staffRole } });
      const member = await getRequestDb(req).collection("profiles").updateById(authUser.id, { role, staffRole, name, phone, status: "active" });
      if (!member) throw Object.assign(new Error("Supabase Auth user was created but staff profile provisioning failed"), { status: 502 });
      await audit(req, "staff_created", { staffId: authUser.id, staffRole });
      sendJSON(res, 201, { staff: publicUser({ ...member, email: authUser.email }), tempPassword });
    } catch (err) {
      if (authUser?.id) { try { await supabaseAuth.adminDeleteUser(authUser.id); } catch {} }
      throw err;
    }
  });

  router.put("/api/staff/:id", authenticate, requireRole("admin"), async (req, res) => {
    const { name, phone, staffRole } = req.body;
    const patch = {};
    if (name) patch.name = name;
    if (phone) patch.phone = phone;
    if (staffRole) patch.staffRole = staffRole;
    if (isSupabase() && staffRole) patch.role = staffRole === "administrator" ? "admin" : "staff";
    const updated = await getRequestDb(req).collection(isSupabase() ? "profiles" : "users").updateById(req.params.id, patch);
    if (!updated) return sendJSON(res, 404, { error: "Staff member not found" });
    sendJSON(res, 200, { staff: publicUser(updated) });
  });

  router.delete("/api/staff/:id", authenticate, requireRole("admin"), async (req, res) => {
    if (isSupabase()) {
      const member = await getRequestDb(req).collection("profiles").findById(req.params.id);
      if (!member || !["staff", "admin"].includes(member.role)) return sendJSON(res, 404, { error: "Staff member not found" });
      if (member.id === req.user.id) return sendJSON(res, 400, { error: "You cannot delete your own admin account" });
      await supabaseAuth.adminDeleteUser(req.params.id);
    } else {
      const ok = await db.collection("users").removeById(req.params.id);
      if (!ok) return sendJSON(res, 404, { error: "Staff member not found" });
    }
    await audit(req, "staff_deleted", { staffId: req.params.id });
    sendJSON(res, 200, { message: "Staff member removed" });
  });
}
module.exports = { register };
