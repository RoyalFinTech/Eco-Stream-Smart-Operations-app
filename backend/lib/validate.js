// lib/validate.js — small validation helpers used by every route.
// Centralizing this is part of the QA fix: the original single-file frontend
// only validated on the client; a real backend must never trust client input.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function requireFields(obj, fields) {
  const missing = fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === "");
  if (missing.length) {
    throw new ValidationError(`Missing required field(s): ${missing.join(", ")}`);
  }
}

function isEmail(v) {
  return typeof v === "string" && EMAIL_RE.test(v);
}

// Strip a small set of characters that have no legitimate use in names/text
// fields and are common injection/markup vectors, without being so aggressive
// that it mangles legitimate input (e.g. addresses with commas/periods).
function sanitizeText(v, maxLen = 2000) {
  if (typeof v !== "string") return v;
  return v.replace(/[<>]/g, "").slice(0, maxLen);
}

module.exports = { ValidationError, requireFields, isEmail, sanitizeText };