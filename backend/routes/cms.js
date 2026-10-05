const db = require("../lib/db");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { audit } = require("../lib/audit");

const DEFAULT_CMS = {
  heroTitle: "No Water At Home? Drill Your Own Borehole Today!",
  heroSubtitle: "Fast · Reliable · Affordable borehole drilling across The Gambia",
  contactPhone: "+220 380 6666",
  contactAddress: "Banjul, The Gambia",
  contactHours: "Mon–Sat, 8am–6pm",
};

function register(router) {
  // ---------- GET /api/cms (public — the client portal reads this on load) ----------
  router.get("/api/cms", async (req, res) => {
    const rows = await db.collection("cms").all();
    const content = rows.length ? rows[0] : DEFAULT_CMS;
    sendJSON(res, 200, { content });
  });

  // ---------- PUT /api/cms (admin only) ----------
  router.put("/api/cms", authenticate, requireRole("admin"), async (req, res) => {
    const cms = db.collection("cms");
    const rows = await cms.all();
    let updated;
    if (rows.length) {
      updated = await cms.updateById(rows[0].id, req.body);
    } else {
      updated = await cms.insert({ id: "cms_1", ...DEFAULT_CMS, ...req.body });
    }
    await audit(req, "cms_updated", { fields: Object.keys(req.body) });
    sendJSON(res, 200, { content: updated });
  });

  // ---------- GET /api/audit-logs (admin only) ----------
  router.get("/api/audit-logs", authenticate, requireRole("admin"), async (req, res) => {
    const logs = (await db.collection("auditLogs").all()).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 500);
    sendJSON(res, 200, { logs });
  });
}

module.exports = { register };