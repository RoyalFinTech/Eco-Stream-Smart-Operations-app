const db = require("../lib/db");
const { sendJSON, authenticate, requireRole } = require("../lib/router");

function register(router) {
  // ---------- GET /api/dashboard/stats (admin/staff) ----------
  router.get("/api/dashboard/stats", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const projects = await db.collection("projects").all();
    const clients = await db.collection("users").find({ role: "client" });
    const staff = await db.collection("users").find({ role: { in: ["staff", "admin"] } });
    const payments = await db.collection("payments").all();
    const expenses = await db.collection("expenses").all();
    const equipment = await db.collection("equipment").all();
    const tickets = await db.collection("tickets").all();

    const revenue = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

    sendJSON(res, 200, {
      revenue,
      profit: revenue - totalExpenses,
      totalExpenses,
      projects: {
        active: projects.filter((p) => p.status === "ongoing").length,
        pending: projects.filter((p) => p.status === "pending").length,
        completed: projects.filter((p) => p.status === "completed").length,
        total: projects.length,
      },
      clients: { total: clients.length, active: clients.filter((c) => c.status !== "suspended").length },
      staff: { total: staff.length },
      equipment: {
        active: equipment.filter((e) => e.status === "active").length,
        maintenance: equipment.filter((e) => e.status === "maintenance").length,
        total: equipment.length,
      },
      tickets: { open: tickets.filter((t) => t.status === "open").length, total: tickets.length },
    });
  });

  // ---------- GET /api/dashboard/client (client's own summary) ----------
  router.get("/api/dashboard/client", authenticate, async (req, res) => {
    const projects = await db.collection("projects").find({ clientId: req.user.id });
    const payments = await db.collection("payments").find({ clientId: req.user.id });
    const tickets = await db.collection("tickets").find({ clientId: req.user.id });
    const totalPaid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
    const totalDue = payments.filter((p) => p.status !== "paid").reduce((s, p) => s + p.amount, 0);
    sendJSON(res, 200, {
      activeProjects: projects.filter((p) => p.status === "ongoing").length,
      completedProjects: projects.filter((p) => p.status === "completed").length,
      totalPaid,
      totalDue,
      openTickets: tickets.filter((t) => t.status === "open").length,
    });
  });
}

module.exports = { register };