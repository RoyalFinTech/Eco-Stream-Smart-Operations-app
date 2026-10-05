const { getRequestDb } = require("../lib/requestDb");
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
  router.get("/api/reports", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const range = req.query.range || "monthly";
    const refDate = req.query.date ? new Date(req.query.date) : new Date();
    if (Number.isNaN(refDate.getTime())) throw Object.assign(new Error("date must be a valid date"), { status: 400 });
    const start = rangeStart(range, refDate);
    const database = getRequestDb(req);
    const [payments, expenses, projects, bookings] = await Promise.all([
      database.collection("payments").all(), database.collection("expenses").all(), database.collection("projects").all(), database.collection("bookings").all(),
    ]);
    const inRange = (value) => value && new Date(value).getTime() >= start.getTime();
    const periodPayments = payments.filter((p) => inRange(p.date));
    const periodExpenses = expenses.filter((e) => inRange(e.date));
    const periodProjects = projects.filter((p) => inRange(p.startDate));
    const periodBookings = bookings.filter((b) => inRange(b.submittedAt));
    const revenue = periodPayments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalExpenses = periodExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    sendJSON(res, 200, { range, periodStart: start.toISOString(), revenue, expenses: totalExpenses, profit: revenue - totalExpenses, newProjects: periodProjects.length, newBookings: periodBookings.length, paymentsCount: periodPayments.length });
  });
}

module.exports = { register };
