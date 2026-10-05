const { getRequestDb } = require("../lib/requestDb");
const { sendJSON, authenticate, requireRole } = require("../lib/router");
const { requireFields, ValidationError } = require("../lib/validate");
const { getStorageProvider } = require("../lib/storage");
const crypto = require("crypto");

const MAX_BASE64_LEN = 8 * 1024 * 1024; // ~6MB decoded, generous for reports/PDFs/images

// Extension allowlist — deliberately conservative for a documents feature
// (reports, water-test results, contracts). Anything else is rejected rather
// than silently stored, since an upload endpoint is a common attack surface.
const SAFE_EXT = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "text/plain": ".txt",
  "application/msword": ".doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx" };

function register(router) {
  // ---------- POST /api/documents (upload) ----------
  // Storage is provider-agnostic (see lib/storage) — this route just calls
  // save/read/remove and never touches fs directly, so switching
  // STORAGE_PROVIDER from local to s3/r2/supabase requires no route changes.
  router.post("/api/documents", authenticate, async (req, res) => {
    const { fileName, mimeType, base64Data, category, clientId } = req.body;
    requireFields(req.body, ["fileName", "mimeType", "base64Data"]);
    if (base64Data.length > MAX_BASE64_LEN) throw new ValidationError("File too large (max ~6MB)");
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) throw new ValidationError("base64Data is not valid base64");
    if (!SAFE_EXT[mimeType]) throw new ValidationError("Unsupported file type: " + mimeType);
    const buffer = Buffer.from(base64Data, "base64");
    if (!buffer.length) throw new ValidationError("Uploaded file is empty");
    if (mimeType === "application/pdf" && buffer.subarray(0, 5).toString() !== "%PDF-") throw new ValidationError("File content does not match PDF type");
    if (mimeType === "image/png" && buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new ValidationError("File content does not match PNG type");
    if (mimeType === "image/jpeg" && !(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) throw new ValidationError("File content does not match JPEG type");
    if (mimeType === "application/msword" && buffer.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1") throw new ValidationError("File content does not match DOC type");
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && buffer.subarray(0, 2).toString() !== "PK") throw new ValidationError("File content does not match DOCX type");

    const ownerId = req.user.role === "client" ? req.user.id : clientId || null;
    const storageKey = crypto.randomUUID() + SAFE_EXT[mimeType];
    const storage = getStorageProvider();
    await storage.save(buffer, storageKey, mimeType);

    const doc = await getRequestDb(req).collection("documents").insert({
      clientId: ownerId,
      fileName,
      mimeType,
      storageKey, // opaque key inside whichever provider is active — never a client-supplied path
      category: category || "other", // report | water-test | contract | other
      uploadedBy: req.user.id,
      createdAt: new Date().toISOString(),
    });
    sendJSON(res, 201, { document: doc });
  });

  // ---------- GET /api/documents (list — metadata only) ----------
  router.get("/api/documents", authenticate, async (req, res) => {
    const all = await getRequestDb(req).collection("documents").all();
    const visible = req.user.role === "client" ? all.filter((d) => d.clientId === req.user.id) : all;
    sendJSON(res, 200, { documents: visible });
  });

  // ---------- GET /api/documents/:id (download) ----------
  router.get("/api/documents/:id", authenticate, async (req, res) => {
    const doc = await getRequestDb(req).collection("documents").findById(req.params.id);
    if (!doc) return sendJSON(res, 404, { error: "Document not found" });
    if (req.user.role === "client" && doc.clientId !== req.user.id) {
      return sendJSON(res, 403, { error: "Forbidden" });
    }
    const storage = getStorageProvider();
    const buffer = await storage.read(doc.storageKey);
    if (!buffer) return sendJSON(res, 404, { error: "File missing from storage" });
    sendJSON(res, 200, { document: { ...doc, base64Data: buffer.toString("base64") } });
  });

  // ---------- DELETE /api/documents/:id ----------
  router.delete("/api/documents/:id", authenticate, requireRole("admin", "staff"), async (req, res) => {
    const doc = await getRequestDb(req).collection("documents").findById(req.params.id);
    if (!doc) return sendJSON(res, 404, { error: "Document not found" });
    const storage = getStorageProvider();
    await storage.remove(doc.storageKey);
    await getRequestDb(req).collection("documents").removeById(req.params.id);
    sendJSON(res, 200, { message: "Document deleted" });
  });
}

module.exports = { register };