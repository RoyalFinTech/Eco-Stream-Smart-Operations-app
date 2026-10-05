const db = require("../lib/db");
const { getRequestDb } = require("../lib/requestDb");
const { createSupabasePublicRepository } = require("../lib/supabaseData");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { audit } = require("../lib/audit");

const DEFAULT_CMS = { heroTitle: "No Water At Home? Drill Your Own Borehole Today!", heroSubtitle: "Fast · Reliable · Affordable borehole drilling across The Gambia", contactPhone: "+220 380 6666", contactAddress: "Banjul, The Gambia", contactHours: "Mon–Sat, 8am–6pm" };
const isSupabase = () => String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase";

function register(router) {
  router.get("/api/cms", async (req, res) => {
    const rows = isSupabase() ? await createSupabasePublicRepository("cms").all() : await db.collection("cms").all();
    const content = rows.length ? rows[0] : DEFAULT_CMS;
    sendJSON(res, 200, { content });
  });

  router.put("/api/cms", authenticate, requireRole("admin"), async (req, res) => {
    const cms = getRequestDb(req).collection("cms");
    const rows = await cms.all();
    let updated;
    if (rows.length) updated = await cms.updateById(rows[0].id, req.body);
    else updated = await cms.insert({ id: "cms_1", ...DEFAULT_CMS, ...req.body });
    await audit(req, "cms_updated", { fields: Object.keys(req.body) });
    sendJSON(res, 200, { content: updated });
  });

  router.get("/api/audit-logs", authenticate, requireRole("admin"), async (req, res) => {
    const logs = (await getRequestDb(req).collection(isSupabase() ? "audit_logs" : "auditLogs").all())
      .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 500);
    sendJSON(res, 200, { logs });
  });
}
module.exports = { register };