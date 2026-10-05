// server.js — EcoStream API. Zero external dependencies: run with `node server.js`.
const http = require("http");
const { Router, sendJSON } = require("./lib/router");
const db = require("./lib/db");
const { seed } = require("./lib/seed");
const { logger, requestLogger } = require("./lib/logger");
const { securityHeaders } = require("./lib/security");
const { assertAuthConfig } = require("./lib/auth");

assertAuthConfig();
function assertProviderConfig() {
  const provider = String(process.env.AUTH_PROVIDER || "json").toLowerCase();
  if (!['json', 'supabase'].includes(provider)) throw new Error(`Unsupported AUTH_PROVIDER: ${provider}`);
  if (provider === 'supabase' && (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required when AUTH_PROVIDER=supabase');
  }
}
assertProviderConfig();
const { rateLimit } = require("./lib/rateLimit");



const router = new Router();

// ---------- global middleware ----------
router.use(securityHeaders);
router.use(requestLogger);
router.use(rateLimit({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_MAX || 120) }));

require("./routes/auth").register(router);
require("./routes/clients").register(router);
require("./routes/projects").register(router);
require("./routes/bookings").register(router);
require("./routes/payments").register(router);
require("./routes/notifications").register(router);
require("./routes/tickets").register(router);
require("./routes/staff").register(router);
require("./routes/equipment").register(router);
require("./routes/dashboard").register(router);
require("./routes/documents").register(router);
require("./routes/chat").register(router);
require("./routes/reports").register(router);
require("./routes/cms").register(router);
require("./routes/sessions").register(router);

router.get("/api/health", (req, res) => {
  sendJSON(res, 200, { status: "ok", time: new Date().toISOString(), uptimeSeconds: Math.round(process.uptime()) });
});

const PORT = process.env.PORT || 4000;

const server = http.createServer((req, res) => {
  router.handle(req, res).catch((err) => {
    logger.error("Unhandled request error", { message: err.message, stack: err.stack });
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });
});

async function bootstrap() {
  if (db.driver === "postgres" && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when DB_DRIVER=postgres");
  }
  if (String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase") {
    // Production Supabase is authoritative; never seed the legacy JSON demo dataset.
  } else {
    await seed(db);
  }
  server.listen(PORT, () => {
    logger.info(`EcoStream API listening on http://localhost:${PORT} (db=${db.driver})`);
    console.log(`EcoStream API listening on http://localhost:${PORT}`);
    console.log(`Database driver: ${db.driver}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`API docs: open documentation/api-docs.html in a browser (see openapi.yaml)`);
  });
}

bootstrap().catch((err) => {
  logger.error("EcoStream startup failed", { message: err.message, stack: err.stack });
  process.exit(1);
});

// ---------- graceful shutdown ----------
// Stop accepting new connections, let in-flight requests finish, then exit.
// Important for zero-downtime deploys/restarts (Render, Railway, Docker all
// send SIGTERM before killing a container).
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close((err) => {
    if (err) {
      logger.error("Error during shutdown", { message: err.message });
      process.exit(1);
    }
    logger.info("Server closed cleanly. Goodbye.");
    db.disconnect().catch((disconnectErr) => logger.error("Database disconnect failed", { message: disconnectErr.message }));
    process.exit(0);
  });
  // Safety net: if something is still open after 10s, force-exit rather than hang forever.
  setTimeout(() => {
    logger.warn("Forcing shutdown after 10s timeout");
    process.exit(1);
  }, 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { message: err.message, stack: err.stack });
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason: String(reason) });
});