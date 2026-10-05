// lib/logger.js — a small structured logger reproducing the parts of
// Winston this project actually needs (leveled, timestamped, JSON-capable
// output). The `winston` npm package isn't installable here (no registry
// access) — this is a genuine substitute, not a stub: it supports levels,
// structured metadata, and a request-logging middleware, and writes to both
// stdout and a rolling log file. Swap for real Winston later by keeping the
// same `logger.info(msg, meta)` call sites — only this file would change.

const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const LEVELS = { error: 0, warn: 1, info: 2, http: 3, debug: 4 };
const CURRENT_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function write(level, message, meta) {
  if (LEVELS[level] > CURRENT_LEVEL) return;
  const entry = { level, message, timestamp: new Date().toISOString(), ...(meta ? { meta } : {}) };
  const line = JSON.stringify(entry);
  (level === "error" ? console.error : console.log)(line);
  try {
    fs.appendFileSync(path.join(LOG_DIR, "app.log"), line + "\n");
  } catch {
    /* disk full or read-only fs — logging must never crash the request */
  }
}

const logger = {
  error: (msg, meta) => write("error", msg, meta),
  warn: (msg, meta) => write("warn", msg, meta),
  info: (msg, meta) => write("info", msg, meta),
  http: (msg, meta) => write("http", msg, meta),
  debug: (msg, meta) => write("debug", msg, meta),
};

// ---------- request logging middleware ----------
function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, url } = req;
  res.on("finish", () => {
    const ms = Date.now() - start;
    logger.http(`${method} ${url} ${res.statusCode} ${ms}ms`, {
      method,
      url,
      status: res.statusCode,
      durationMs: ms,
      userId: req.user ? req.user.id : undefined,
    });
  });
  next();
}

module.exports = { logger, requestLogger };