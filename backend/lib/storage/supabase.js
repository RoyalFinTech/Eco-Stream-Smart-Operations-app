// lib/storage/supabase.js — Supabase Storage via its REST API using plain
// fetch() (the `@supabase/supabase-js` package isn't installable here — no
// registry access). Supabase's Storage REST API is straightforward bearer-
// token HTTP, so no custom request signing is needed (unlike S3/R2).
// Written against Supabase's documented Storage API; not exercised against
// a real Supabase project in this sandbox (no credentials/network here).

function createSupabaseProvider({ projectUrl, serviceRoleKey, bucket }) {
  const base = `${projectUrl.replace(/\/$/, "")}/storage/v1/object`;
  const authHeaders = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };

  return {
    name: "supabase",
    async save(buffer, key, mimeType) {
      const res = await fetch(`${base}/${bucket}/${key}`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": mimeType || "application/octet-stream", "x-upsert": "true" },
        body: buffer,
      });
      if (!res.ok) throw new Error(`Supabase upload failed: ${res.status} ${await res.text()}`);
      return { key };
    },
    async read(key) {
      const res = await fetch(`${base}/${bucket}/${key}`, { headers: authHeaders });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Supabase download failed: ${res.status} ${await res.text()}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(key) {
      const res = await fetch(`${base}/${bucket}/${key}`, { method: "DELETE", headers: authHeaders });
      if (!res.ok && res.status !== 404) throw new Error(`Supabase delete failed: ${res.status} ${await res.text()}`);
    },
    async exists(key) {
      return (await this.read(key)) !== null;
    },
  };
}

module.exports = { createSupabaseProvider };