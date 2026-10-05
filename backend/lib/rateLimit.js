// lib/rateLimit.js — in-memory rate limiting (no external package available).
// Fine for a single-process deployment (matches the JSON datastore's single-
// process assumption — see db.js). For multi-instance deployments, replace
// the in-memory Map with a shared store (Redis) — the middleware signature
// wouldn't need to change.

function rateLimit({ windowMs = 60_000, max = 60, keyFn = (req) => req.socket?.remoteAddress || "unknown" } = {}) {
  const hits = new Map(); // key -> [timestamps]

  // periodic cleanup so the Map doesn't grow unbounded over a long-running process
  const sweep = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of hits) {
      const kept = timestamps.filter((t) => t > cutoff);
      if (kept.length) hits.set(key, kept);
      else hits.delete(key);
    }
  }, windowMs).unref();

  return function rateLimitMiddleware(req, res, next) {
    const key = keyFn(req);
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (hits.get(key) || []).filter((t) => t > cutoff);
    timestamps.push(now);
    hits.set(key, timestamps);

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - timestamps.length)));

    if (timestamps.length > max) {
      res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
      res.writeHead(429, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Too many requests — please slow down and try again shortly." }));
    }
    next();
  };
}

module.exports = { rateLimit };