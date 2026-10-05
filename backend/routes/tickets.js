const db = require("../lib/db");
const { getRequestDb } = require("../lib/requestDb");
const { genId } = require("../lib/auth");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { requireFields } = require("../lib/validate");
const { paginate, textFilter } = require("../lib/pagination");

async function nextTicketNumber() {
  return "TCK-" + Date.now().toString(36).toUpperCase();
}

function register(router) {
  // ---------- POST /api/tickets ----------
  router.post("/api/tickets", authenticate, async (req, res) => {
    const { subject, description, category, priority, location } = req.body;
    requireFields(req.body, ["subject", "description"]);
    const database = getRequestDb(req);
    const ticket = await database.collection("tickets").insert({
      ticketNumber: await nextTicketNumber(),
      clientId: req.user.role === "client" ? req.user.id : req.body.clientId || null,
      subject,
      description,
      category: category || "general",
      priority: priority || "medium",
      status: "open",
      location: location || "",
      replies: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    sendJSON(res, 201, { ticket });
  });

  // ---------- GET /api/tickets ----------
  // Backward compatible: no query params -> { tickets: [...] } as before.
  // ?search=, ?status=, ?page=/?pageSize= opt into filtering/paging.
  router.get("/api/tickets", authenticate, async (req, res) => {
    const all = await getRequestDb(req).collection("tickets").all();
    let visible = req.user.role === "client" ? all.filter((t) => t.clientId === req.user.id) : all;
    if (req.query.status) visible = visible.filter((t) => t.status === req.query.status);
    visible = textFilter(visible, req.query.search, ["subject", "description", "ticketNumber", "location"]);
    const { items, paginated, meta } = paginate(visible, req.query);
    sendJSON(res, 200, paginated ? { tickets: items, meta } : { tickets: items });
  });

  // ---------- PUT /api/tickets/:id (status change and/or reply) ----------
  router.put("/api/tickets/:id", authenticate, async (req, res) => {
    const tickets = getRequestDb(req).collection("tickets");
    const existing = await tickets.findById(req.params.id);
    if (!existing) return sendJSON(res, 404, { error: "Ticket not found" });
    if (req.user.role === "client" && existing.clientId !== req.user.id) {
      return sendJSON(res, 403, { error: "Forbidden" });
    }
    const patch = {};
    if (req.body.status && (req.user.role === "admin" || req.user.role === "staff")) patch.status = req.body.status;
    if (req.body.reply) {
      patch.replies = [
        ...(existing.replies || []),
        { id: genId("rp"), author: req.user.name, message: req.body.reply, date: new Date().toISOString() },
      ];
    }
    const updated = await tickets.updateById(req.params.id, patch);
    sendJSON(res, 200, { ticket: updated });
  });

  // ---------- DELETE /api/tickets/:id ----------
  router.delete("/api/tickets/:id", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const ok = await getRequestDb(req).collection("tickets").removeById(req.params.id);
    if (!ok) return sendJSON(res, 404, { error: "Ticket not found" });
    sendJSON(res, 200, { message: "Ticket deleted" });
  });
}

module.exports = { register };