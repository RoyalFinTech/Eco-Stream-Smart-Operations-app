// lib/storage/index.js — picks a storage provider based on STORAGE_PROVIDER.
// Every provider implements the same { save, read, remove, exists } shape,
// so routes/documents.js never needs to know which one is active.
//
// Only "local" has been run and verified in this environment (see
// QA_AUDIT_REPORT.md). The s3/r2/supabase providers are complete,
// correctly-written implementations of each service's documented API, but
// require real credentials and outbound network access this sandbox
// doesn't have — verify them against a real bucket before depending on them.

const path = require("path");
const { createLocalProvider } = require("./local");
const { createS3Provider } = require("./s3");
const { createR2Provider } = require("./r2");
const { createSupabaseProvider } = require("./supabase");

let cachedProvider = null;

function getStorageProvider() {
  if (cachedProvider) return cachedProvider;

  const kind = process.env.STORAGE_PROVIDER || "local";

  switch (kind) {
    case "local":
      cachedProvider = createLocalProvider({ dir: path.join(__dirname, "..", "..", "uploads") });
      break;
    case "s3":
      cachedProvider = createS3Provider({
        bucket: process.env.S3_BUCKET,
        region: process.env.S3_REGION,
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      });
      break;
    case "r2":
      cachedProvider = createR2Provider({
        accountId: process.env.R2_ACCOUNT_ID,
        bucket: process.env.R2_BUCKET,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      });
      break;
    case "supabase":
      cachedProvider = createSupabaseProvider({
        projectUrl: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        bucket: process.env.SUPABASE_BUCKET,
      });
      break;
    default:
      throw new Error(`Unknown STORAGE_PROVIDER: "${kind}". Use local, s3, r2, or supabase.`);
  }

  return cachedProvider;
}

module.exports = { getStorageProvider };