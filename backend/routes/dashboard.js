const { getRequestDb } = require("../lib/requestDb");
const { sendJSON, authenticate, requireRole } = require("../lib/router");

function register(router) {
  router.get("/api/dashboard/stats", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const database = getRequestDb(req);
    const profilesTable = String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase" ? "profiles" : "users";
    const [projects, clients, staff, payments, expenses, equipment, tickets] = await Promise.all([
      database.collection("projects").all(),
      database.collection(profilesTable).find({ role: "client" }),
      database.collection(profilesTable).find({ role: { in: ["staff", "admin"] } }),
      database.collection("payments").all(),
      database.collection("expenses").all(),
      database.collection("equipment").all(),
      database.collection("tickets").all(),
    ]);
    const revenue = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    sendJSON(res, 200, {
      revenue, profit: revenue - totalExpenses, totalExpenses,
      projects: { active: projects.filter((p) => p.status === "ongoing").length, pending: projects.filter((p) => p.status === "pending").length, completed: projects.filter((p) => p.status === "completed").length, total: projects.length },
      clients: { total: clients.length, active: clients.filter((c) => c.status !== "suspended").length },
      staff: { total: staff.length },
      equipment: { active: equipment.filter((e) => e.status === "active").length, maintenance: equipment.filter((e) => e.status === "maintenance").length, total: equipment.length },
      tickets: { open: tickets.filter((t) => t.status === "open").length, total: tickets.length },
    });
  });

  router.get("/api/dashboard/client", authenticate, async (req, res) => {
    const database = getRequestDb(req);
    const [projects, payments, tickets] = await Promise.all([
      database.collection("projects").find({ clientId: req.user.id }),
      database.collection("payments").find({ clientId: req.user.id }),
      database.collection("tickets").find({ clientId: req.user.id }),
    ]);
    const totalPaid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalDue = payments.filter((p) => p.status !== "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
    sendJSON(res, 200, { activeProjects: projects.filter((p) => p.status === "ongoing").length, completedProjects: projects.filter((p) => p.status === "completed").length, totalPaid, totalDue, openTickets: tickets.filter((t) => t.status === "open").length });
  });
}

module.exports = { register };
