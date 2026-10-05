const db = require("../lib/db");
const { sendJSON, authenticate, requireRole } = require("../lib/router");

function rangeStart(range, ref) {
  const d = new Date(ref);
  if (range === "daily") { d.setHours(0, 0, 0, 0); return d; }
  if (range === "weekly") { d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d; }
  if (range === "monthly") { d.setDate(1); d.setHours(0, 0, 0, 0); return d; }
  if (range === "annual") { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); return d; }
  throw Object.assign(new Error("range must be daily, weekly, monthly, or annual"), { status: 400 });
}

function register(router) {
  // ---------- GET /api/reports?range=daily|weekly|monthly|annual&date=YYYY-MM-DD ----------
  router.get("/api/reports", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const range = req.query.range || "monthly";
    const refDate = req.query.date ? new Date(req.query.date) : new Date();
    const start = rangeStart(range, refDate);

    const payments = await db.collection("payments").find((p) => new Date(p.date) >= start);
    const expenses = await db.collection("expenses").find((e) => new Date(e.date) >= start);
    const projects = await db.collection("projects").find((p) => new Date(p.startDate) >= start);
    const bookings = await db.collection("bookings").find((b) => new Date(b.submittedAt) >= start);

    const revenue = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

    sendJSON(res, 200, {
      range,
      periodStart: start.toISOString(),
      revenue,
      expenses: totalExpenses,
      profit: revenue - totalExpenses,
      newProjects: projects.length,
      newBookings: bookings.length,
      paymentsCount: payments.length,
    });
  });
}

module.exports = { register };