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
async function requestPasswordReset(email, redirectTo) {
  const body = { email };
  if (redirectTo) body.redirect_to = redirectTo;
  return authRequest("recover", "POST", body);
}

module.exports = { signUp, signIn, refresh, getUser, updateUser, requestPasswordReset };