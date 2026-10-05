// lib/storage/r2.js — Cloudflare R2 is S3-API-compatible, so this just
// points the hand-rolled SigV4 signer (s3.js) at R2's endpoint instead of
// AWS's. Same caveat as s3.js: written correctly per R2's documented S3
// compatibility, not exercised against a real R2 bucket in this sandbox
// (no credentials, no network to cloudflarestorage.com here).
const { createS3Provider } = require("./s3");

function createR2Provider({ accountId, bucket, accessKeyId, secretAccessKey }) {
  const provider = createS3Provider({
    bucket,
    region: "auto", // R2 uses "auto" as the region in SigV4 signing
    accessKeyId,
    secretAccessKey,
    endpointHost: `${accountId}.r2.cloudflarestorage.com`,
    pathStyle: true, // R2 endpoints are path-style: host/bucket/key, not bucket.host/key
  });
  return { ...provider, name: "r2" };
}

module.exports = { createR2Provider };