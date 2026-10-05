const { toSnake, toCamel, normalizeWhere } = require("./supabaseSchemaMap");

function config() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY || "";
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required for Supabase data access");
  return { url, key };
}

function assertToken(token) {
  if (!token || typeof token !== "string") throw Object.assign(new Error("Supabase access token is required"), { status: 401 });
}

async function request(table, token, method, query = "", body) {
  assertToken(token);
  const { url, key } = config();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const response = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}${query ? `?${query}` : ""}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const err = new Error(data?.message || data?.error_description || data?.hint || `Supabase request failed (${response.status})`);
    err.status = response.status >= 500 ? 502 : response.status;
    err.details = data;
    throw err;
  }
  return Array.isArray(data) ? data : data == null ? [] : [data];
}

function filters(where = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(where)) {
    const snake = key;
    if (value && typeof value === "object" && Array.isArray(value.in)) params.set(snake, `in.(${value.in.join(",")})`);
    else if (value === null) params.set(snake, "is.null");
    else params.set(snake, `eq.${String(value)}`);
  }
  return params.toString();
}

function createSupabaseRepository(table, accessToken) {
  assertToken(accessToken);
  const mapOut = (rows) => rows.map((row) => toCamel(table, row));
  return {
    async all() {
      return mapOut(await request(table, accessToken, "GET", "select=*"));
    },
    async find(where) {
      if (typeof where === "function") throw new Error(`Function predicates are not supported by Supabase repository: ${table}`);
      const q = new URLSearchParams(filters(normalizeWhere(table, where || {})));
      q.set("select", "*");
      return mapOut(await request(table, accessToken, "GET", q.toString()));
    },
    async findOne(where) {
      const rows = await this.find(where);
      return rows[0] || null;
    },
    async findById(id) {
      if (!id) return null;
      const q = new URLSearchParams({ select: "*", id: `eq.${id}`, limit: "1" });
      return (await request(table, accessToken, "GET", q.toString())).map((r) => toCamel(table, r))[0] || null;
    },
    async insert(record) {
      const rows = await request(table, accessToken, "POST", "", toSnake(table, record));
      return rows[0] ? toCamel(table, rows[0]) : null;
    },
    async updateById(id, patch) {
      if (!id) return null;
      const q = new URLSearchParams({ id: `eq.${id}`, select: "*" });
      const rows = await request(table, accessToken, "PATCH", q.toString(), toSnake(table, patch));
      return rows[0] ? toCamel(table, rows[0]) : null;
    },
    async removeById(id) {
      if (!id) return false;
      const q = new URLSearchParams({ id: `eq.${id}`, select: "id" });
      const rows = await request(table, accessToken, "DELETE", q.toString());
      return rows.length > 0;
    },
    async replaceAll() { throw new Error("replaceAll is intentionally unsupported for Supabase production data"); },
  };
}

module.exports = { createSupabaseRepository };