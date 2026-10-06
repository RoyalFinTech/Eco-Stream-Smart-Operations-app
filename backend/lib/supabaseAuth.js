function config() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY || "";
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required for Supabase Auth");
  return { url, key };
}

async function authRequest(path, method, body, accessToken) {
  const { url, key } = config();
  const headers = { apikey: key, Accept: "application/json", "Content-Type": "application/json" };
  headers.Authorization = `Bearer ${accessToken || key}`;
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

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("220")) return "+" + digits;
  if (digits.length === 9) return "+220" + digits;
  throw Object.assign(new Error("Enter a valid Gambian phone number"), { status: 422 });
}
async function signUp({ phone, password, data }) {
  const normalizedPhone = normalizePhone(phone);
  return authRequest("signup", "POST", { phone: normalizedPhone, password, data: { ...(data || {}), phone: normalizedPhone } });
}
async function signIn({ phone, email, password }) {
  const credentials = email
    ? { email: String(email).trim().toLowerCase(), password }
    : { phone: normalizePhone(phone), password };
  return authRequest("token?grant_type=password", "POST", credentials);
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
async function verifyPhone(phone, token, type = "sms") {
  return authRequest("verify", "POST", { phone: normalizePhone(phone), token, type });
}

function adminConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw Object.assign(new Error("A Supabase server secret key is required for privileged Auth administration"), { status: 503 });
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

function internalAuthEmail(phone) {
  const normalized = normalizePhone(phone);
  const digits = normalized.split("").filter((ch) => ch >= "0" && ch <= "9").join("");
  return `phone_${digits}@accounts.ecostream.gm`;
}
async function adminFindUserByEmail(email) {
  const users = await adminListUsers();
  const target = String(email || "").trim().toLowerCase();
  return users.find((u) => String(u.email || "").toLowerCase() === target) || null;
}
async function adminFindUserByPhone(phone) {
  const users = await adminListUsers();
  const target = normalizePhone(phone);
  return users.find((u) => {
    const candidate = u.phone || u.user_metadata?.phone || "";
    if (!candidate) return false;
    try { return normalizePhone(candidate) === target; } catch { return false; }
  }) || null;
}
async function adminUpdatePhoneIdentity(userId, phone) {
  const normalized = normalizePhone(phone);
  const current = await adminGetUser(userId);
  const metadata = { ...(current.user_metadata || {}), phone: normalized };
  return adminUpdateUser(userId, {
    email: internalAuthEmail(normalized),
    email_confirm: true,
    user_metadata: metadata,
  });
}
async function adminCreateUser({ phone, email, password, phoneConfirmed = true, emailConfirmed = true, data = {} }) {
  if (email) return adminRequest("users", "POST", { email: String(email).trim().toLowerCase(), password, email_confirm: emailConfirmed, user_metadata: { ...(data || {}) } });

  return adminRequest("users", "POST", { phone: normalizePhone(phone), password, phone_confirm: phoneConfirmed, user_metadata: { ...(data || {}), phone: normalizePhone(phone) } });
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
  const next = { ...(attributes || {}) };
  if (next.phone) next.phone = normalizePhone(next.phone);
  return adminRequest(`users/${encodeURIComponent(userId)}`, "PUT", next);
}

async function adminDeleteUser(userId) {
  if (!userId) throw new Error("userId is required");
  return adminRequest(`users/${encodeURIComponent(userId)}`, "DELETE");
}

module.exports = { normalizePhone, internalAuthEmail, signUp, signIn, refresh, getUser, updateUser, signOut, requestPasswordReset, verifyPhone, adminCreateUser, adminFindUserByEmail, adminFindUserByPhone, adminGetUser, adminListUsers, adminUpdateUser, adminUpdatePhoneIdentity, adminDeleteUser };