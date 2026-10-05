// lib/router.js — a tiny router so we don't need Express (no internet access
// to install it). Supports :params, JSON body parsing, CORS, global
// middleware, and automatic /api/v1/ aliasing for every /api/ route so
// existing frontend calls (unversioned) and future mobile clients
// (versioned) both work against the same handlers.

const { verifyToken } = require("./auth");
const { getUser } = require("./supabaseAuth");
const { createSupabaseRepository } = require("./supabaseData");
const { logger } = require("./logger");

function pathToRegex(routePath) {
  const paramNames = [];
  const pattern = routePath
    .replace(/\/+$/, "")
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) {
        paramNames.push(seg.slice(1));
        return "([^/]+)";
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { regex: new RegExp(`^${pattern}/?$`), paramNames };
}

// Origins allowed to call this API. Set ALLOWED_ORIGINS (comma-separated) in
// production to lock this down — see DEPLOYMENT_CHECKLIST.md. Left as "*" by
// default so the two static HTML portals work out of the box from file://
// (which sends no Origin header, or "null") during local/demo use.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : null;

function resolveCorsOrigin(reqOrigin) {
  if (!ALLOWED_ORIGINS) return "*";
  if (!reqOrigin || reqOrigin === "null") return ALLOWED_ORIGINS[0] || "*"; // file:// pages
  return ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOWED_ORIGINS[0];
}

class Router {
  constructor() {
    this.routes = []; // {method, regex, paramNames, handlers:[...]}
    this.middleware = []; // global middleware, run before routing on every request
  }

  use(fn) {
    this.middleware.push(fn);
  }

  add(method, routePath, ...handlers) {
    const { regex, paramNames } = pathToRegex(routePath);
    this.routes.push({ method, regex, paramNames, handlers });
    // Automatic versioned alias: POST /api/auth/login also becomes reachable
    // at POST /api/v1/auth/login, without every route file needing to know
    // about versioning. Mobile clients should prefer the /v1/ path going
    // forward; the unversioned path stays for the existing web portals.
    if (routePath.startsWith("/api/") && !routePath.startsWith("/api/v1/")) {
      const versioned = "/api/v1/" + routePath.slice("/api/".length);
      const { regex: vRegex, paramNames: vParams } = pathToRegex(versioned);
      this.routes.push({ method, regex: vRegex, paramNames: vParams, handlers });
    }
  }
  get(p, ...h) { this.add("GET", p, ...h); }
  post(p, ...h) { this.add("POST", p, ...h); }
  put(p, ...h) { this.add("PUT", p, ...h); }
  patch(p, ...h) { this.add("PATCH", p, ...h); }
  delete(p, ...h) { this.add("DELETE", p, ...h); }

  async handle(req, res) {
    const origin = resolveCorsOrigin(req.headers.origin);
    res.setHeader("Access-Control-Allow-Origin", origin);
    if (origin !== "*") res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(urlObj.pathname);
    req.query = Object.fromEntries(urlObj.searchParams.entries());

    // global middleware chain (security headers, request logging, rate limiting, ...)
    let mi = 0;
    const runMiddleware = (err) => {
      if (err) { logger.error(err.message || "Server error", { stack: err.stack }); return sendJSON(res, err.status || 500, { error: err.message || "Server error" }); }
      if (res.writableEnded) return; // a middleware (e.g. rate limiter) already responded
      const mw = this.middleware[mi++];
      if (mw) return mw(req, res, runMiddleware);
      routeRequest();
    };

    const routeRequest = async () => {
      const match = this.routes.find((r) => r.method === req.method && r.regex.test(pathname));
      if (!match) return sendJSON(res, 404, { error: "Not found", path: pathname });

      const m = pathname.match(match.regex);
      req.params = {};
      match.paramNames.forEach((name, i) => (req.params[name] = m[i + 1]));
      try {
        req.body = await parseBody(req);
      } catch (err) {
        return sendJSON(res, err.status || 400, { error: err.message || "Invalid request body" });
      }

      let i = 0;
      const next = (err) => {
        if (err) { logger.error(err.message || "Server error", { stack: err.stack, path: pathname }); return sendJSON(res, err.status || 500, { error: err.message || "Server error" }); }
        const handler = match.handlers[i++];
        if (!handler) return; // handler chain is expected to send a response
        try {
          const maybePromise = handler(req, res, next);
          if (maybePromise && typeof maybePromise.catch === "function") {
            maybePromise.catch(next);
          }
        } catch (e) {
          next(e);
        }
      };
      next();
    };

    runMiddleware();
  }
}

const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 12 * 1024 * 1024);

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === "GET" || req.method === "DELETE") return resolve({});
    let raw = "";
    let size = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejected = true;
        req.resume();
        const err = new Error(`Request body too large (max ${MAX_BODY_BYTES} bytes)`);
        err.status = 413;
        return reject(err);
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (rejected) return;
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        const err = new Error("Invalid JSON request body");
        err.status = 400;
        reject(err);
      }
    });
    req.on("error", (err) => reject(err));
  });
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

// ---------- auth middleware ----------
async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase") {
    if (!token) return sendJSON(res, 401, { error: "Unauthorized — invalid or missing token" });
    try {
      const authUser = await getUser(token);
      const profile = await createSupabaseRepository("profiles", token).findById(authUser.id);
      if (!profile) return sendJSON(res, 403, { error: "Account profile not found" });
      if (profile.status === "suspended") return sendJSON(res, 403, { error: "This account has been suspended. Contact support." });
      req.user = { id: authUser.id, role: profile.role, name: profile.name || authUser.user_metadata?.name || authUser.email, email: authUser.email, phone: profile.phone, status: profile.status, authProvider: "supabase", accessToken: token, authUser, profile };
      return next();
    } catch (err) {
      logger.warn("Supabase authentication failed", { message: err.message, status: err.status });
      return sendJSON(res, 401, { error: "Unauthorized — invalid or expired token" });
    }
  }
  const payload = verifyToken(token);
  if (!payload) return sendJSON(res, 401, { error: "Unauthorized — invalid or missing token" });
  req.user = payload;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendJSON(res, 403, { error: "Forbidden — insufficient permissions" });
    }
    next();
  };
}

module.exports = { Router, sendJSON, authenticate, requireRole };