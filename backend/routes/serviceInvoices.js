const { getRequestDb } = require("../lib/requestDb");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { ValidationError, sanitizeText } = require("../lib/validate");
const { toCamel, toSnake } = require("../lib/supabaseSchemaMap");

const LABELS = {
  drilling: "Borehole Drilling", "site-survey": "Site Survey", maintenance: "Borehole Maintenance",
  repair: "Borehole Repair", "solar-installation": "Solar Water Installation",
  "pump-service": "Water Pump Services", cleaning: "Borehole Cleaning",
  "water-quality": "Water Quality Testing",
};
const SERVICE_LINES = {
  drilling: ["Borehole drilling and site works", "Casing and screen installation", "Water pump and plumbing materials", "Transport and workmanship"],
  "site-survey": ["Site inspection and survey", "Water assessment / testing"],
  maintenance: ["Borehole inspection", "Preventive maintenance and servicing", "Materials (if required)"],
  repair: ["Fault diagnosis", "Repair labour", "Replacement parts (if required)"],
  "solar-installation": ["Solar water system design", "Solar panels and mounting", "Pump, controller and electrical installation"],
  "pump-service": ["Pump inspection / diagnosis", "Pump installation or repair labour", "Materials and fittings (if required)"],
  cleaning: ["Borehole inspection", "Cleaning and disinfection", "Post-cleaning water check"],
  "water-quality": ["Water sample collection", "Requested water quality tests", "Results and recommendations"],
};
const money = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const clean = (v, max=500) => sanitizeText(String(v ?? "").trim(), max);
function parseItems(input) {
  if (!Array.isArray(input) || !input.length) throw new ValidationError("Add at least one invoice line item.");
  if (input.length > 60) throw new ValidationError("An invoice can contain at most 60 line items.");
  return input.map((item, i) => {
    const description = clean(item.description, 250);
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!description) throw new ValidationError("Line " + (i + 1) + " needs a description.");
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000) throw new ValidationError("Line " + (i + 1) + " has an invalid quantity.");
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000000) throw new ValidationError("Line " + (i + 1) + " has an invalid unit price.");
    return { description, quantity: money(quantity), unitPrice: money(unitPrice), total: money(quantity * unitPrice) };
  });
}
function totals(items, discount, tax) {
  const subtotal = money(items.reduce((sum, item) => sum + item.total, 0));
  const d = Number(discount || 0), t = Number(tax || 0);
  if (!Number.isFinite(d) || d < 0 || d > subtotal) throw new ValidationError("Discount must be between zero and the subtotal.");
  if (!Number.isFinite(t) || t < 0 || t > 1000000000) throw new ValidationError("Enter a valid tax amount.");
  return { subtotal, discount: money(d), tax: money(t), total: money(subtotal - d + t) };
}
async function getClient(db, id) {
  const client = await db.collection("profiles").findById(id);
  if (!client) throw Object.assign(new Error("The booking customer profile could not be found."), { status: 404 });
  return client;
}
function supabaseAdminConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw Object.assign(new Error("Secure invoice scheduling is temporarily unavailable."), {status:503});
  return {url, key};
}
async function adminTableRequest(table, method, query, body) {
  const {url,key} = supabaseAdminConfig();
  const response = await fetch(url + "/rest/v1/" + table + (query ? "?" + query : ""), {
    method, headers:{apikey:key, Authorization:"Bearer " + key, "Content-Type":"application/json", Prefer:"return=representation"}, body:body===undefined?undefined:JSON.stringify(body)
  });
  const raw = await response.text();
  let data=[]; try { data=raw?JSON.parse(raw):[]; } catch {}
  if (!response.ok) throw Object.assign(new Error("Could not save the service appointment request."), {status:502});
  return Array.isArray(data) ? data : [];
}

async function findServiceInvoice(id) {
  const rows = await adminTableRequest("service_invoices", "GET", "id=eq." + encodeURIComponent(id) + "&select=*&limit=1");
  return rows[0] ? toCamel("service_invoices", rows[0]) : null;
}
async function insertServiceInvoice(record) {
  const rows = await adminTableRequest("service_invoices", "POST", "", toSnake("service_invoices", record));
  if (!rows[0]) throw Object.assign(new Error("The invoice draft could not be saved."), {status:502});
  return toCamel("service_invoices", rows[0]);
}
async function updateServiceInvoice(id, patch) {
  const body = toSnake("service_invoices", patch);
  body.updated_at = new Date().toISOString();
  const rows = await adminTableRequest("service_invoices", "PATCH", "id=eq." + encodeURIComponent(id) + "&select=*", body);
  return rows[0] ? toCamel("service_invoices", rows[0]) : null;
}

function register(router) {
  router.get("/api/service-invoices", authenticate, async (req, res) => {
    // This table is intentionally not readable by the client-facing publishable key.
    // Read with the server-only Supabase secret, then enforce ownership here before returning data.
    const rawRows = await adminTableRequest("service_invoices", "GET", "select=*&order=created_at.desc");
    const rows = rawRows.map(row => toCamel("service_invoices", row));
    const visible = req.user.role === "client" ? rows.filter(row => row.clientId === req.user.id) : rows;
    sendJSON(res, 200, { invoices: visible.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
  });

  router.post("/api/service-invoices/draft", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const db = getRequestDb(req);
    const bookingId = clean(req.body?.bookingId, 80);
    if (!bookingId) throw new ValidationError("Choose a booking before preparing an invoice.");
    const booking = await db.collection("bookings").findById(bookingId);
    if (!booking) throw Object.assign(new Error("Booking not found."), { status: 404 });
    const client = await getClient(db, booking.clientId);
    const serviceType = booking.requestType || "drilling";
    const lines = (SERVICE_LINES[serviceType] || ["Service work as agreed"]).map(description => ({description, quantity:1, unitPrice:0}));
    const invoice = await insertServiceInvoice({
      bookingId: booking.id, clientId: booking.clientId, serviceType,
      clientName: client.name || "Customer", clientPhone: client.phone || "",
      clientAddress: client.address || "", serviceAddress: booking.drillingLocation || "",
      lineItems: lines, subtotal:0, discount:0, tax:0, total:0, currency:"GMD",
      paymentTerms:"Payment terms to be agreed with the customer",
      dueDate:null, serviceDate:null, serviceTime:"", scheduleStatus:"not-requested",
      scheduleNotes:"", notes: booking.siteNotes || "", status:"draft",
      pdfStorageKey:null, createdBy:req.user.id, approvedBy:null, approvedAt:null, sentAt:null,
      createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
    });
    sendJSON(res, 201, { invoice, message:"Invoice draft prepared from the booking. Confirm all descriptions, quantities and prices before sending." });
  });

  router.put("/api/service-invoices/:id", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const db = getRequestDb(req);
    const current = await findServiceInvoice(req.params.id);
    if (!current) return sendJSON(res, 404, {error:"Invoice not found."});
    if (["sent","paid","cancelled"].includes(current.status)) throw Object.assign(new Error("Issued, paid or cancelled invoices cannot be edited here. Create a revised invoice or use the proper bookkeeping adjustment process."), {status:409});
    const items = parseItems(req.body.lineItems);
    const calculated = totals(items, req.body.discount, req.body.tax);
    const patch = {
      lineItems:items, ...calculated,
      clientName:clean(req.body.clientName,160) || current.clientName,
      clientPhone:clean(req.body.clientPhone,60), clientAddress:clean(req.body.clientAddress,300),
      serviceAddress:clean(req.body.serviceAddress,300),
      paymentTerms:clean(req.body.paymentTerms,500),
      dueDate:req.body.dueDate || null,
      serviceDate:req.body.serviceDate || null,
      serviceTime:clean(req.body.serviceTime,80),
      scheduleNotes:clean(req.body.scheduleNotes,1000),
      notes:clean(req.body.notes,2000),
      updatedAt:new Date().toISOString()
    };
    if (!patch.serviceAddress) throw new ValidationError("The service address is required.");
    if (patch.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)) throw new ValidationError("Enter a valid due date.");
    if (patch.serviceDate && !/^\d{4}-\d{2}-\d{2}$/.test(patch.serviceDate)) throw new ValidationError("Enter a valid proposed service date.");
    const updated = await updateServiceInvoice(current.id, patch);
    sendJSON(res, 200, {invoice:updated, message:"Invoice draft saved. Please review totals and terms before sending."});
  });

  router.post("/api/service-invoices/:id/send", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const db = getRequestDb(req);
    const current = await findServiceInvoice(req.params.id);
    if (!current) return sendJSON(res, 404, {error:"Invoice not found."});
    if (current.status !== "draft" && current.status !== "approved") throw Object.assign(new Error("Only a reviewed draft can be sent."), {status:409});
    const items = parseItems(current.lineItems);
    const calculated = totals(items, current.discount, current.tax);
    if (calculated.total <= 0) throw new ValidationError("Add and confirm the actual service prices before sending this invoice.");
    if (!current.clientName || !current.serviceAddress) throw new ValidationError("Customer name and service address are required before sending.");
    const now = new Date().toISOString();
    const updated = await updateServiceInvoice(current.id, {
      ...calculated, lineItems:items, status:"sent", approvedBy:req.user.id, approvedAt:now, sentAt:now, updatedAt:now
    });
    await db.collection("notifications").insert({
      userId:current.clientId, type:"invoice", title:"Your EcoStream invoice is ready",
      message:"Invoice " + current.invoiceNumber + " for " + (LABELS[current.serviceType] || "your requested service") + " is ready to view and download in your client portal.",
      read:false, date:now.slice(0,10), createdAt:now
    });
    sendJSON(res, 200, {invoice:updated, message:"Invoice sent to the customer's portal. In-app notification created."});
  });

  router.put("/api/service-invoices/:id/schedule", authenticate, async (req, res) => {
    const db = getRequestDb(req);
    const current = await findServiceInvoice(req.params.id);
    if (!current) return sendJSON(res, 404, {error:"Invoice not found."});
    if (req.user.role === "client" && current.clientId !== req.user.id) return sendJSON(res, 403, {error:"You cannot change another customer's schedule."});
    if (!["sent","paid"].includes(current.status)) throw Object.assign(new Error("Scheduling is available once the invoice has been sent."), {status:409});
    const serviceDate = req.body?.serviceDate ? String(req.body.serviceDate) : "";
    const serviceTime = clean(req.body?.serviceTime,80);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !serviceTime) throw new ValidationError("Choose a proposed service date and time.");
    const now = new Date().toISOString();
    const allowedScheduleStatuses = ["requested","confirmed","reschedule-requested","cancelled"];
    const scheduleStatus = req.user.role === "client" ? "requested" : (allowedScheduleStatuses.includes(req.body?.scheduleStatus) ? req.body.scheduleStatus : "confirmed");
    const schedulePatch = {service_date:serviceDate, service_time:serviceTime, schedule_status:scheduleStatus, schedule_notes:clean(req.body?.scheduleNotes,1000), updated_at:now};
    let updated;
    if (req.user.role === "client") {
      // The public client role cannot directly update invoice records; this narrowly-scoped
      // server operation has already verified invoice ownership and only writes scheduling fields.
      const rows = await adminTableRequest("service_invoices", "PATCH", "id=eq."+encodeURIComponent(current.id)+"&client_id=eq."+encodeURIComponent(req.user.id)+"&select=*", schedulePatch);
      if (!rows[0]) return sendJSON(res, 404, {error:"Invoice not found for this customer."});
      updated = {...current, serviceDate, serviceTime, scheduleStatus, scheduleNotes:schedulePatch.schedule_notes, updatedAt:now};
      await adminTableRequest("notifications", "POST", "", {
        user_id:null, type:"schedule", title:"Customer requested a service appointment",
        message:"Customer " + current.clientName + " requested " + serviceDate + " at " + serviceTime + " for invoice " + current.invoiceNumber + ". Please review and confirm in the admin portal.",
        read:false, date:now.slice(0,10), created_at:now
      });
    } else {
      updated = await updateServiceInvoice(current.id, {
        serviceDate, serviceTime, scheduleStatus,
        scheduleNotes:clean(req.body?.scheduleNotes,1000), updatedAt:now
      });
    }
    if (req.user.role !== "client") {
      await db.collection("notifications").insert({
        userId:current.clientId, type:"schedule", title:"Service appointment updated",
        message:(scheduleStatus === "confirmed" ? "EcoStream confirmed your service appointment for invoice " : "EcoStream updated the appointment for invoice ") + current.invoiceNumber + " to " + serviceDate + " at " + serviceTime + ".",
        read:false, date:now.slice(0,10), createdAt:now
      });
    }
    sendJSON(res, 200, {invoice:updated, message:req.user.role==="client"?"Appointment request sent to EcoStream for confirmation.":"Appointment details updated."});
  });
}
module.exports = { register };
