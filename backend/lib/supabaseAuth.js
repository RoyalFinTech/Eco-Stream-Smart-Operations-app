function config() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY || "";
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required for Supabase Auth");
  return { url, key };
}

async function authRequest(path, method, body, accessToken) {
  const { url, key } = config();
  const headers = { apikey: key, Accept: "application/json", "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${url}/auth/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const err = new Error(data?.msg || data?.message || data?.error_description || "Supabase Auth request failed");
    err.status = response.status;
    err.details = data;
    throw err;
  }
  return data;
}

async function signUp({ email, password, data }) {
  return authRequest("signup", "POST", { email, password, data });
}
async function signIn({ email, password }) {
  return authRequest("token?grant_type=password", "POST", { email, password });
}
async function refresh(refreshToken) {
  return authRequest("token?grant_type=refresh_token", "POST", { refresh_token: refreshToken });
}
async function getUser(accessToken) {
  return authRequest("user", "GET", undefined, accessToken);
}
async function updateUser(accessToken, attributes) {
  return authRequest("user", "PUT", attributes, accessToken);
}
async function signOut(accessToken) {
  return authRequest("logout", "POST", undefined, accessToken);
}

async function requestPasswordReset(email, redirectTo) {
  const body = { email };
  if (redirectTo) body.redirect_to = redirectTo;
  return authRequest("recover", "POST", body);
}

function adminConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw Object.assign(new Error("SUPABASE_SERVICE_ROLE_KEY is required for privileged Supabase Auth administration"), { status: 503 });
  return { url, key };
}

async function adminRequest(path, method, body) {
  const { url, key } = adminConfig();
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" };
  const response = await fetch(`${url}/auth/v1/admin/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const err = new Error(data?.msg || data?.message || data?.error_description || "Supabase Auth admin request failed");
    err.status = response.status >= 500 ? 502 : response.status;
    err.details = data;
    throw err;
  }
  return data;
}

async function adminCreateUser({ email, password, emailConfirmed = true, data = {} }) {
  return adminRequest("users", "POST", { email, password, email_confirm: emailConfirmed, user_metadata: data });
}

async function adminGetUser(userId) {
  if (!userId) throw new Error("userId is required");
  return adminRequest(`users/${encodeURIComponent(userId)}`, "GET");
}

async function adminListUsers() {
  const data = await adminRequest("users?per_page=1000", "GET");
  return Array.isArray(data) ? data : (data?.users || []);
}

async function adminUpdateUser(userId, attributes) {
  if (!userId) throw new Error("userId is required");
  return adminRequest(`users/${encodeURIComponent(userId)}`, "PUT", attributes);
}

async function adminDeleteUser(userId) {
  if (!userId) throw new Error("userId is required");
  return adminRequest(`users/${encodeURIComponent(userId)}`, "DELETE");
}

module.exports = { signUp, signIn, refresh, getUser, updateUser, signOut, requestPasswordReset, adminCreateUser, adminGetUser, adminListUsers, adminUpdateUser, adminDeleteUser };