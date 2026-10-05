// lib/seed.js — initial demo data so both frontends have something to show
// on first run. All ids are stable strings so the two HTML apps can link
// records (projects -> clients, payments -> projects, etc).

const { hashPassword, genId } = require("./auth");

async function seed(db) {
  // Never create predictable administrator accounts in production. Demo data
  // is opt-in for local QA only.
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_DATA !== "true") return;

  const demoAdminPassword = process.env.DEMO_ADMIN_PASSWORD || "Admin@1234";
  const demoEngineerPassword = process.env.DEMO_ENGINEER_PASSWORD || "Engineer@1234";
  const demoClientPassword = process.env.DEMO_CLIENT_PASSWORD || "Client@1234";

  await db.seedIfEmpty("users", () => [
    {
      id: "u_admin1",
      role: "admin",
      staffRole: "administrator",
      name: "Ebrima Colley",
      email: "admin@ecostream.gm",
      phone: "+220 3000001",
      password: hashPassword(demoAdminPassword),
      emailVerified: true,
      failedLoginAttempts: 0,
      lockUntil: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: "u_eng1",
      role: "staff",
      staffRole: "engineer",
      name: "Momodou Jarju",
      email: "engineer@ecostream.gm",
      phone: "+220 3000002",
      password: hashPassword(demoEngineerPassword),
      emailVerified: true,
      failedLoginAttempts: 0,
      lockUntil: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: "u_client1",
      role: "client",
      name: "Lamin Jallow",
      email: "lamin@example.com",
      phone: "+220 7111111",
      address: "Bakau, The Gambia",
      password: hashPassword(demoClientPassword),
      emailVerified: true,
      failedLoginAttempts: 0,
      lockUntil: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: "u_client2",
      role: "client",
      name: "Fatou Ceesay",
      email: "fatou@example.com",
      phone: "+220 7222222",
      address: "Serrekunda, The Gambia",
      password: hashPassword(demoClientPassword),
      emailVerified: true,
      failedLoginAttempts: 0,
      lockUntil: null,
      createdAt: new Date().toISOString(),
    },
  ]);

  await db.seedIfEmpty("projects", () => [
    {
      id: "p_1",
      clientId: "u_client1",
      location: "Bakau, The Gambia",
      status: "ongoing",
      depth: 42,
      totalDepth: 60,
      waterYield: 0,
      soilType: "Laterite",
      startDate: "2026-06-20",
      assignedEngineerId: "u_eng1",
      notes: "Drilling proceeding on schedule.",
      createdAt: new Date().toISOString(),
    },
    {
      id: "p_2",
      clientId: "u_client2",
      location: "Serrekunda, The Gambia",
      status: "completed",
      depth: 55,
      totalDepth: 55,
      waterYield: 3.2,
      soilType: "Sandy clay",
      startDate: "2026-05-02",
      assignedEngineerId: "u_eng1",
      notes: "Completed and commissioned. Solar pump installed.",
      createdAt: new Date().toISOString(),
    },
  ]);

  await db.seedIfEmpty("bookings", () => [
    {
      id: "b_1",
      clientId: "u_client1",
      package: "solar",
      drillingLocation: "Bakau, The Gambia",
      areaType: "residential",
      purpose: "drinking",
      paymentPlan: "installment",
      status: "approved",
      submittedAt: "2026-06-15",
      createdAt: new Date().toISOString(),
    },
  ]);

  await db.seedIfEmpty("payments", () => [
    {
      id: "pay_1",
      clientId: "u_client1",
      projectId: "p_1",
      amount: 25000,
      method: "Mobile Money",
      status: "paid",
      date: "2026-06-25",
      createdAt: new Date().toISOString(),
    },
    {
      id: "pay_2",
      clientId: "u_client2",
      projectId: "p_2",
      amount: 68000,
      method: "Bank Transfer",
      status: "paid",
      date: "2026-05-30",
      createdAt: new Date().toISOString(),
    },
  ]);

  await db.seedIfEmpty("notifications", () => [
    {
      id: "n_1",
      userId: "u_client1",
      type: "project",
      title: "Drilling update",
      message: "Your borehole in Bakau has reached 42m depth.",
      read: false,
      date: "2026-07-01",
      createdAt: new Date().toISOString(),
    },
  ]);

  await db.seedIfEmpty("tickets", () => [
    {
      id: "t_1",
      ticketNumber: "TCK-0001",
      clientId: "u_client1",
      subject: "Pump making noise",
      description: "The solar pump has started making a grinding noise.",
      category: "pump-issue",
      priority: "medium",
      status: "open",
      location: "Bakau, The Gambia",
      replies: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  await db.seedIfEmpty("equipment", () => [
    { id: "eq_1", type: "Drilling Rig", name: "Rig Alpha", status: "active", lastMaintenance: "2026-06-01", createdAt: new Date().toISOString() },
    { id: "eq_2", type: "Vehicle", name: "Toyota Hilux (BJL 1234)", status: "active", lastMaintenance: "2026-05-15", createdAt: new Date().toISOString() },
  ]);

  await db.seedIfEmpty("expenses", () => [
    { id: "ex_1", category: "Fuel", amount: 4200, date: "2026-07-02", note: "Rig Alpha refuel", createdAt: new Date().toISOString() },
  ]);
}

module.exports = { seed };