const http = require("http");
const fs = require("fs");
const path = require("path");
const { Router, sendJSON } = require("./lib/router");
const db = require("./lib/db");
const { seed } = require("./lib/seed");
const { logger, requestLogger } = require("./lib/logger");
const { securityHeaders } = require("./lib/security");
const { assertAuthConfig } = require("./lib/auth");

assertAuthConfig();
function assertProviderConfig() {
  const provider = String(process.env.AUTH_PROVIDER || "json").toLowerCase();
  if (!["json", "supabase"].includes(provider)) throw new Error(`Unsupported AUTH_PROVIDER: ${provider}`);
  if (provider === "supabase" && (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required when AUTH_PROVIDER=supabase");
  }
  if (String(process.env.STORAGE_PROVIDER || "local").toLowerCase() === "supabase" &&
      (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_BUCKET)) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_BUCKET are required when STORAGE_PROVIDER=supabase");
  }
}
assertProviderConfig();
const { rateLimit } = require("./lib/rateLimit");

const router = new Router();
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

router.get("/api/config/public", (req, res) => {
  sendJSON(res, 200, {
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    passkeyRpId: "ecostream-m2sy.onrender.com",
    passkeyOrigin: "https://ecostream-m2sy.onrender.com"
  });
});

router.get("/api/health", (req, res) => {
  sendJSON(res, 200, { status: "ok", time: new Date().toISOString(), uptimeSeconds: Math.round(process.uptime()) });
});

const PORT = process.env.PORT || 4000;
const backendRoot = path.resolve(__dirname, "..");
const portalRoots = {
  "/portal": path.join(backendRoot, "client-portal"),
  "/admin": path.join(backendRoot, "admin-portal"),
};

function safePortalPath(root, pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidate = path.resolve(root, relative || "index.html");
  return candidate === root || candidate.startsWith(root + path.sep) ? candidate : null;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".txt": "text/plain; charset=utf-8",
  })[ext] || "application/octet-stream";
}

function servePortal(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const rootClientRequest = parsed.pathname === "/" || parsed.pathname === "";
  const prefix = rootClientRequest ? "/portal" : Object.keys(portalRoots).find((key) => parsed.pathname === key || parsed.pathname.startsWith(key + "/"));
  if (!prefix) return false;

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return true;
  }

  const root = portalRoots[prefix];
  let filePath = safePortalPath(root, rootClientRequest ? "/index.html" : parsed.pathname.slice(prefix.length));
  if (!filePath) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return true;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(root, "index.html");
  }

  try {
    const body = fs.readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": path.basename(filePath) === "index.html" ? "no-cache" : "public, max-age=86400",
    });
    if (req.method === "HEAD") res.end();
    else res.end(body);
  } catch (err) {
    logger.error("Portal asset error", { message: err.message, filePath });
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Portal asset unavailable");
  }
  return true;
}

const server = http.createServer((req, res) => {
  if (servePortal(req, res)) return;
  router.handle(req, res).catch((err) => {
    logger.error("Unhandled request error", { message: err.message, stack: err.stack });
    if (!res.headersSent) {
      res.writeHead(err.status || 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.status ? err.message : "Internal server error" }));
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
    logger.info(`EcoStream API listening on port ${PORT} (db=${db.driver})`);
    console.log(`EcoStream service listening on port ${PORT}`);
    console.log("Client portal: /portal/");
    console.log("Admin portal: /admin/");
    console.log("Health check: /api/health");
  });
}

bootstrap().catch((err) => {
  logger.error("EcoStream startup failed", { message: err.message, stack: err.stack });
  process.exit(1);
});

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
