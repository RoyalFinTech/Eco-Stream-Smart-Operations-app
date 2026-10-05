const TABLES = {
  profiles: {
    clientId: "id", staffRole: "staff_role", createdAt: "created_at", updatedAt: "updated_at",
  },
  projects: {
    clientId: "client_id", totalDepth: "total_depth", waterYield: "water_yield", soilType: "soil_type",
    startDate: "start_date", assignedEngineerId: "assigned_engineer_id", createdAt: "created_at", updatedAt: "updated_at",
  },
  bookings: {
    clientId: "client_id", requestType: "request_type", drillingLocation: "drilling_location", areaType: "area_type",
    paymentPlan: "payment_plan", submittedAt: "submitted_at", createdAt: "created_at",
  },
  payments: { clientId: "client_id", projectId: "project_id", createdAt: "created_at" },
  notifications: { userId: "user_id", createdAt: "created_at" },
  tickets: { ticketNumber: "ticket_number", clientId: "client_id", createdAt: "created_at", updatedAt: "updated_at" },
  documents: { clientId: "client_id", fileName: "file_name", mimeType: "mime_type", storagePath: "storage_path", uploadedBy: "uploaded_by", createdAt: "created_at" },
  chat_messages: { clientId: "client_id", senderName: "sender_name", createdAt: "created_at" },
  equipment: { lastMaintenance: "last_maintenance", createdAt: "created_at" },
  expenses: { createdAt: "created_at" },
  cms: {},
  audit_logs: { actorId: "actor_id", actorName: "actor_name", actorRole: "actor_role", createdAt: "date", date: "date" },
};

const REVERSE = Object.fromEntries(Object.entries(TABLES).map(([table, map]) => [table, Object.fromEntries(Object.entries(map).map(([camel, snake]) => [snake, camel]))]));

function toSnake(table, input = {}) {
  const map = TABLES[table] || {};
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "id" && table !== "cms") continue; // production UUIDs are DB-generated
    if (key === "createdAt" || key === "updatedAt") continue; // DB defaults own timestamps
    out[map[key] || key] = value;
  }
  return out;
}

function toCamel(table, input) {
  if (!input || typeof input !== "object") return input;
  const map = REVERSE[table] || {};
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [map[key] || key, value]));
}

function normalizeWhere(table, where = {}) {
  return Object.fromEntries(Object.entries(where).map(([key, value]) => [TABLES[table]?.[key] || key, value]));
}

module.exports = { TABLES, toSnake, toCamel, normalizeWhere };