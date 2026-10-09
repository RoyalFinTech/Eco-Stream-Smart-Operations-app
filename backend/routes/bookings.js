const { getRequestDb } = require("../lib/requestDb");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { requireFields } = require("../lib/validate");

function register(router) {
  // ---------- POST /api/bookings (client books drilling / requests a site survey) ----------
  router.post("/api/bookings", authenticate, async (req, res) => {
    const { package: pkg, drillingLocation, areaType, purpose, paymentPlan, requestType, latitude, longitude, locationAddress, waterRequirement, siteNotes, preferredContactTime, gpsAccuracy } = req.body;
    requireFields(req.body, ["drillingLocation"]);

    // GPS coordinates are optional. If supplied, require a valid latitude/longitude pair.
    const hasLatitude = latitude !== undefined && latitude !== null && String(latitude).trim() !== "";
    const hasLongitude = longitude !== undefined && longitude !== null && String(longitude).trim() !== "";
    if (hasLatitude !== hasLongitude) {
      return sendJSON(res, 400, { error: "Precise coordinates are optional. If you enter them, provide both latitude and longitude." });
    }
    let parsedLatitude = null;
    let parsedLongitude = null;
    if (hasLatitude && hasLongitude) {
      parsedLatitude = Number(latitude);
      parsedLongitude = Number(longitude);
      if (!Number.isFinite(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90 ||
          !Number.isFinite(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180) {
        return sendJSON(res, 400, { error: "Please enter valid GPS coordinates, or leave both coordinate fields blank." });
      }
    }
    const parsedAccuracy = gpsAccuracy == null || gpsAccuracy === "" ? null : Number(gpsAccuracy);
    if (parsedAccuracy !== null && (!Number.isFinite(parsedAccuracy) || parsedAccuracy < 0)) {
      return sendJSON(res, 400, { error: "GPS accuracy must be a valid non-negative number." });
    }

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
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      locationAddress: locationAddress || "",
      waterRequirement: waterRequirement || "",
      siteNotes: siteNotes || "",
      preferredContactTime: preferredContactTime || "",
      gpsAccuracy: parsedAccuracy,
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