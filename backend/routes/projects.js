const { getRequestDb } = require("../lib/requestDb");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { ValidationError } = require("../lib/validate");

function scopeForUser(req, project) {
  if (req.user.role === "admin" || req.user.role === "staff") return true;
  return project.clientId === req.user.id;
}

function register(router) {
  // ---------- GET /api/projects ----------
  // Admin/staff see all; clients see only their own.
  router.get("/api/projects", authenticate, async (req, res) => {
    const projects = await getRequestDb(req).collection("projects").all();
    const visible = String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase" ? projects : projects.filter((p) => scopeForUser(req, p));
    sendJSON(res, 200, { projects: visible });
  });

  // ---------- POST /api/projects (admin/staff create a project, usually from an approved booking) ----------
  router.post("/api/projects", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const { clientId, location, totalDepth, soilType, assignedEngineerId } = req.body;
    if (!clientId || !location) throw new ValidationError("clientId and location are required");
    const project = await getRequestDb(req).collection("projects").insert({
      clientId,
      location,
      status: "pending",
      depth: 0,
      totalDepth: totalDepth || 60,
      waterYield: 0,
      soilType: soilType || "",
      startDate: new Date().toISOString().slice(0, 10),
      assignedEngineerId: assignedEngineerId || null,
      notes: "",
      timeline: [{ date: new Date().toISOString(), label: "Project created" }],
      createdAt: new Date().toISOString(),
    });
    sendJSON(res, 201, { project });
  });

  // ---------- PUT /api/projects/:id ----------
  router.put("/api/projects/:id", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const projects = getRequestDb(req).collection("projects");
    const existing = await projects.findById(req.params.id);
    if (!existing) return sendJSON(res, 404, { error: "Project not found" });
    const allowed = ["location", "status", "depth", "totalDepth", "waterYield", "soilType", "notes", "assignedEngineerId"];
    const patch = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
    const updated = await projects.updateById(req.params.id, patch);
    sendJSON(res, 200, { project: updated });
  });

  // ---------- DELETE /api/projects/:id ----------
  router.delete("/api/projects/:id", authenticate, requireRole("admin"), async (req, res) => {
    const ok = await getRequestDb(req).collection("projects").removeById(req.params.id);
    if (!ok) return sendJSON(res, 404, { error: "Project not found" });
    sendJSON(res, 200, { message: "Project deleted" });
  });

  // ---------- GET /api/projects/status/:id ----------
  router.get("/api/projects/status/:id", authenticate, async (req, res) => {
    const project = await getRequestDb(req).collection("projects").findById(req.params.id);
    if (!project || !scopeForUser(req, project)) return sendJSON(res, 404, { error: "Project not found" });
    const pct = project.totalDepth > 0 ? Math.round((project.depth / project.totalDepth) * 100) : 0;
    sendJSON(res, 200, { status: project.status, depth: project.depth, totalDepth: project.totalDepth, percentComplete: pct });
  });

  // ---------- GET /api/projects/timeline/:id ----------
  router.get("/api/projects/timeline/:id", authenticate, async (req, res) => {
    const project = await getRequestDb(req).collection("projects").findById(req.params.id);
    if (!project || !scopeForUser(req, project)) return sendJSON(res, 404, { error: "Project not found" });
    sendJSON(res, 200, { timeline: project.timeline || [] });
  });

  // ---------- POST /api/projects/:id/timeline (admin/staff add a timeline event) ----------
  router.post("/api/projects/:id/timeline", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const { label } = req.body;
    if (!label) throw new ValidationError("label is required");
    const projects = getRequestDb(req).collection("projects");
    const project = await projects.findById(req.params.id);
    if (!project) return sendJSON(res, 404, { error: "Project not found" });
    const timeline = [...(project.timeline || []), { date: new Date().toISOString(), label }];
    const updated = await projects.updateById(req.params.id, { timeline });
    sendJSON(res, 200, { project: updated });
  });
}

module.exports = { register };