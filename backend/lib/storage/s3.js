// lib/storage/s3.js — S3 (and S3-compatible) storage using AWS Signature V4,
// implemented by hand with Node's built-in `crypto` and global `fetch`
// (the `aws-sdk`/`@aws-sdk/client-s3` packages aren't installable in this
// environment — no registry access). This follows the documented SigV4
// algorithm (AWS "Signature Version 4 signing process") exactly, but —
// important — it has NOT been exercised against a real bucket, since this
// sandbox has neither AWS credentials nor network access to s3.amazonaws.com.
// Treat this as a correct-per-spec implementation to be verified against a
// real bucket before relying on it in production, not as a tested feature.

const crypto = require("crypto");

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}
function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function getSignatureKey(secretKey, dateStamp, region, service) {
  const kDate = hmac("AWS4" + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function amzDates() {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20260717T192233Z
  const dateStamp = amzDate.slice(0, 8);
  return { amzDate, dateStamp };
}

// Builds a signed request (method/url/headers) for a single S3 object
// operation. `endpoint` lets this same code serve AWS S3 or any
// S3-compatible host (Cloudflare R2, MinIO, etc.) — see r2.js which reuses
// this with R2's endpoint format.
function signRequest({ method, host, path: objectPath, region, accessKeyId, secretAccessKey, payloadHash, extraHeaders = {} }) {
  const { amzDate, dateStamp } = amzDates();
  const canonicalUri = objectPath.startsWith("/") ? objectPath : "/" + objectPath;
  const canonicalQuerystring = "";

  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extraHeaders,
  };
  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${headers[k]}\n`).join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalRequest = [method, canonicalUri, canonicalQuerystring, canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, "s3");
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url: `https://${host}${canonicalUri}`, headers: { ...headers, Authorization: authorizationHeader } };
}

function createS3Provider({ bucket, region, accessKeyId, secretAccessKey, endpointHost, pathStyle = false }) {
  // AWS S3 default: virtual-hosted-style (bucket in the hostname).
  // R2/MinIO/custom endpoints: path-style (bucket is the first path segment)
  // — set pathStyle:true and pass endpointHost for those.
  const host = endpointHost || `${bucket}.s3.${region}.amazonaws.com`;
  const keyPath = (key) => (pathStyle ? `/${bucket}/${key}` : `/${key}`);

  return {
    name: "s3",
    async save(buffer, key, mimeType) {
      const payloadHash = sha256Hex(buffer);
      const { url, headers } = signRequest({
        method: "PUT", host, path: keyPath(key), region, accessKeyId, secretAccessKey, payloadHash,
        extraHeaders: mimeType ? { "content-type": mimeType } : {},
      });
      const res = await fetch(url, { method: "PUT", headers, body: buffer });
      if (!res.ok) throw new Error(`S3 upload failed: ${res.status} ${await res.text()}`);
      return { key };
    },
    async read(key) {
      const payloadHash = sha256Hex(Buffer.alloc(0));
      const { url, headers } = signRequest({ method: "GET", host, path: keyPath(key), region, accessKeyId, secretAccessKey, payloadHash });
      const res = await fetch(url, { method: "GET", headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`S3 download failed: ${res.status} ${await res.text()}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(key) {
      const payloadHash = sha256Hex(Buffer.alloc(0));
      const { url, headers } = signRequest({ method: "DELETE", host, path: keyPath(key), region, accessKeyId, secretAccessKey, payloadHash });
      const res = await fetch(url, { method: "DELETE", headers });
      if (!res.ok && res.status !== 404) throw new Error(`S3 delete failed: ${res.status} ${await res.text()}`);
    },
    async exists(key) {
      return (await this.read(key)) !== null;
    },
  };
}

module.exports = { createS3Provider, signRequest, sha256Hex };