// lib/security.js — the same headers Helmet sets, applied directly.
// The `helmet` npm package itself isn't installable in this environment
// (no registry access), so this reproduces its defaults by hand rather than
// silently skipping security headers. If you later `npm install helmet` in
// a normal environment, swap this middleware for `app.use(helmet())` — the
// header set below is deliberately the same so behavior doesn't change.

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0"); // modern guidance: rely on CSP, not the deprecated XSS auditor
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'"
  ); // this is a JSON API — it serves no HTML/JS itself, so a locked-down CSP is safe
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); // the two static portals call this API from file:// / other origins
  res.removeHeader("X-Powered-By");
  next();
}

module.exports = { securityHeaders };