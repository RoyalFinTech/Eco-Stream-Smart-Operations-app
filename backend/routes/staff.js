const db = require("../lib/db");
const { hashPassword, genId } = require("../lib/auth");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { publicUser } = require("./auth");
const { requireFields, ValidationError } = require("../lib/validate");

function register(router) {
  // ---------- GET /api/staff ----------
  router.get("/api/staff", authenticate, requireRole("admin"), async (req, res) => {
    const staff = (await db.collection("users").find({ role: { in: ["staff", "admin"] } })).map(publicUser);
    sendJSON(res, 200, { staff });
  });

  // ---------- POST /api/staff ----------
  router.post("/api/staff", authenticate, requireRole("admin"), async (req, res) => {
    const { name, email, phone, staffRole } = req.body; // staffRole: engineer|technician|driver|administrator
    requireFields(req.body, ["name", "email", "phone", "staffRole"]);
    const users = db.collection("users");
    if (await users.findOne((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new ValidationError("An account with this email already exists");
    }
    const tempPassword = Math.random().toString(36).slice(2, 10);
    const member = await users.insert({
      id: genId("u"),
      role: staffRole === "administrator" ? "admin" : "staff",
      staffRole,
      name,
      email: email.toLowerCase(),
      phone,
      password: hashPassword(tempPassword),
      createdAt: new Date().toISOString(),
    });
    sendJSON(res, 201, { staff: publicUser(member), tempPassword });
  });

  // ---------- PUT /api/staff/:id ----------
  router.put("/api/staff/:id", authenticate, requireRole("admin"), async (req, res) => {
    const { name, phone, staffRole } = req.body;
    const patch = {};
    if (name) patch.name = name;
    if (phone) patch.phone = phone;
    if (staffRole) patch.staffRole = staffRole;
    const updated = await db.collection("users").updateById(req.params.id, patch);
    if (!updated) return sendJSON(res, 404, { error: "Staff member not found" });
    sendJSON(res, 200, { staff: publicUser(updated) });
  });

  // ---------- DELETE /api/staff/:id ----------
  router.delete("/api/staff/:id", authenticate, requireRole("admin"), async (req, res) => {
    const ok = await db.collection("users").removeById(req.params.id);
    if (!ok) return sendJSON(res, 404, { error: "Staff member not found" });
    sendJSON(res, 200, { message: "Staff member removed" });
  });
}

module.exports = { register };