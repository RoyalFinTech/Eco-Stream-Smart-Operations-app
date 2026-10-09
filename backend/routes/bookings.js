const { getRequestDb } = require("../lib/requestDb");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { requireFields, ValidationError, sanitizeText } = require("../lib/validate");

function register(router) {
  // ---------- POST /api/bookings (client books drilling / requests a site survey) ----------
  router.post("/api/bookings", authenticate, async (req, res) => {
    const body = req.body || {};
    const requestType = String(body.requestType || "drilling");
    const serviceNames = {
      drilling: "Borehole Drilling",
      "site-survey": "Site Survey",
      maintenance: "Borehole Maintenance",
      repair: "Borehole Repair",
      "solar-installation": "Solar Water Installation",
      "pump-service": "Water Pump Services",
      cleaning: "Borehole Cleaning",
      "water-quality": "Water Quality Testing",
    };
    const requiredByService = {
      drilling: [],
      "site-survey": ["surveyPurpose"],
      maintenance: ["boreholeProvider", "maintenanceType", "issueDescription"],
      repair: ["boreholeProvider", "repairIssue", "waterStatus", "urgency", "issueDescription"],
      "solar-installation": ["solarService", "areaType", "waterRequirement"],
      "pump-service": ["pumpType", "pumpServiceType"],
      cleaning: ["boreholeProvider", "cleaningReason"],
      "water-quality": ["waterSource", "testTypes"],
    };
    if (!Object.prototype.hasOwnProperty.call(serviceNames, requestType)) {
      throw new ValidationError("Please choose one of the available EcoStream services.");
    }
    requireFields(body, ["drillingLocation", ...requiredByService[requestType]]);
    const drillingLocation = sanitizeText(String(body.drillingLocation || "").trim(), 250);
    if (!drillingLocation) throw new ValidationError("Please enter the project or site address.");
    if (body.contactPreference && !["phone", "whatsapp", "either"].includes(body.contactPreference)) {
      throw new ValidationError("Please choose a valid contact preference.");
    }

    // GPS is intentionally optional for every service. When provided, coordinates must be a valid pair.
    const latitude = body.latitude;
    const longitude = body.longitude;
    const hasLatitude = latitude !== undefined && latitude !== null && String(latitude).trim() !== "";
    const hasLongitude = longitude !== undefined && longitude !== null && String(longitude).trim() !== "";
    if (hasLatitude !== hasLongitude) {
      throw new ValidationError("Precise coordinates are optional. If you enter them, provide both latitude and longitude.");
    }
    let parsedLatitude = null;
    let parsedLongitude = null;
    if (hasLatitude && hasLongitude) {
      parsedLatitude = Number(latitude);
      parsedLongitude = Number(longitude);
      if (!Number.isFinite(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90 ||
          !Number.isFinite(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180) {
        throw new ValidationError("Please enter valid GPS coordinates, or leave both coordinate fields blank.");
      }
    }
    const parsedAccuracy = body.gpsAccuracy == null || body.gpsAccuracy === "" ? null : Number(body.gpsAccuracy);
    if (parsedAccuracy !== null && (!Number.isFinite(parsedAccuracy) || parsedAccuracy < 0)) {
      throw new ValidationError("GPS accuracy must be a valid non-negative number.");
    }

    // Keep service-specific answers in the existing site_notes text column.
    // This avoids requiring a production Supabase schema migration just to add booking types.
    const detailLabels = {
      package: "Service package", areaType: "Site type", purpose: "Main water use",
      waterRequirement: "Expected water demand", paymentPlan: "Preferred payment plan",
      surveyPurpose: "Survey requested", siteAccess: "Site access",
      boreholeProvider: "Original borehole provider", maintenanceType: "Maintenance requested",
      lastMaintenanceDate: "Last maintenance", issueDescription: "Problem / requirements",
      repairIssue: "Repair needed", waterStatus: "Current water supply", urgency: "Priority",
      solarService: "Solar service requested", existingPower: "Existing power setup",
      pumpType: "Pump type", pumpServiceType: "Pump service requested",
      cleaningReason: "Cleaning reason", lastCleanedDate: "Last cleaned",
      waterSource: "Water source", testTypes: "Water testing requested",
      contactPreference: "Preferred contact method",
    };
    const detailLines = [];
    for (const [key, label] of Object.entries(detailLabels)) {
      const value = body[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        detailLines.push(`${label}: ${sanitizeText(String(value).trim(), 500)}`);
      }
    }
    const customerNotes = typeof body.siteNotes === "string" ? sanitizeText(body.siteNotes.trim(), 1800) : "";
    const serviceNotes = [
      `Requested service: ${serviceNames[requestType]}`,
      ...detailLines,
      customerNotes ? `Additional customer notes: ${customerNotes}` : "",
    ].filter(Boolean).join("\n");
    const booking = await getRequestDb(req).collection("bookings").insert({
      clientId: req.user.id,
      requestType,
      package: sanitizeText(String(body.package || (requestType === "drilling" ? "standard" : requestType)), 80),
      drillingLocation,
      areaType: sanitizeText(String(body.areaType || "residential"), 80),
      purpose: sanitizeText(String(body.purpose || "general"), 80),
      paymentPlan: sanitizeText(String(body.paymentPlan || "full"), 80),
      status: "pending",
      submittedAt: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      locationAddress: sanitizeText(String(body.locationAddress || "").trim(), 250),
      waterRequirement: sanitizeText(String(body.waterRequirement || ""), 100),
      siteNotes: serviceNotes.slice(0, 4000),
      preferredContactTime: sanitizeText(String(body.preferredContactTime || ""), 40),
      gpsAccuracy: parsedAccuracy,
    });
    sendJSON(res, 201, {
      booking,
      message: "Your request has been received. The EcoStream team will review the details and contact you about the next steps.",
    });
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