const { getRequestDb } = require("../lib/requestDb");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { requireFields } = require("../lib/validate");

function register(router) {
  // ---------- POST /api/bookings (client books drilling / requests a site survey) ----------
  router.post("/api/bookings", authenticate, async (req, res) => {
    const { package: pkg, drillingLocation, areaType, purpose, paymentPlan, requestType } = req.body;
    requireFields(req.body, ["drillingLocation"]);
    const booking = await getRequestDb(req).collection("bookings").insert({
      clientId: req.user.id,
      requestType: requestType || "drilling", // "drilling" | "site-survey"
      package: pkg || "standard",
      drillingLocation,
      areaType: areaType || "residential",
      purpose: purpose || "drinking",
      paymentPlan: paymentPlan || "full",
      status: "pending",
      submittedAt: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    });
    sendJSON(res, 201, { booking });
  });

  // ---------- GET /api/bookings ----------
  router.get("/api/bookings", authenticate, async (req, res) => {
    const all = await getRequestDb(req).collection("bookings").all();
    const visible = String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase" ? all : (req.user.role === "client" ? all.filter((b) => b.clientId === req.user.id) : all);
    sendJSON(res, 200, { bookings: visible });
  });

  // ---------- PUT /api/bookings/:id (admin/staff approve, reject, move to in-progress) ----------
  router.put("/api/bookings/:id", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const { status } = req.body;
    const updated = await getRequestDb(req).collection("bookings").updateById(req.params.id, { status });
    if (!updated) return sendJSON(res, 404, { error: "Booking not found" });
    sendJSON(res, 200, { booking: updated });
  });

  // ---------- DELETE /api/bookings/:id ----------
  router.delete("/api/bookings/:id", authenticate, async (req, res) => {
    const bookings = getRequestDb(req).collection("bookings");
    const existing = await bookings.findById(req.params.id);
    if (!existing) return sendJSON(res, 404, { error: "Booking not found" });
    if (req.user.role === "client" && existing.clientId !== req.user.id) {
      return sendJSON(res, 403, { error: "Forbidden" });
    }
    await bookings.removeById(req.params.id);
    sendJSON(res, 200, { message: "Booking cancelled" });
  });
}

module.exports = { register };