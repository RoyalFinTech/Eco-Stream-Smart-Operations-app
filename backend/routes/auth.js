const db = require("../lib/db");
const { getRequestDb } = require("../lib/requestDb");
const supabaseAuth = require("../lib/supabaseAuth");
const { hashPassword, verifyPassword, signToken, genId, genResetToken, hashToken } = require("../lib/auth");
const { sendEmail } = require("../lib/email");
const { sendJSON, authenticate } = require("../lib/router");
const { requireFields, isEmail, ValidationError } = require("../lib/validate");
const { audit } = require("../lib/audit");
const { createSession, findValidSession, revokeSession, rotateSession } = require("../lib/sessions");
const { rateLimit } = require("../lib/rateLimit");

const customerLoginRateLimit = rateLimit({ windowMs: 60_000, max: 10 });
const adminLoginRateLimit = rateLimit({ windowMs: 60_000, max: 5 });

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function publicUser(u) {
  const { password, resetToken, resetTokenExpires, emailVerificationToken, emailVerificationTokenExpires, failedLoginAttempts, lockUntil, ...pub } = u;
  return pub;
}

function normalizePhoneInput(phone) { return supabaseAuth.normalizePhone(phone); }
function validatePin(pin) {
  if (!/^\d{6}$/.test(String(pin || ""))) throw new ValidationError("PIN must be exactly 6 digits");
}
async function ensureConfiguredAdmin({ repairPassword = true } = {}) {
  const email = String(process.env.ADMIN_LOGIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_LOGIN_PASSWORD || "");
  if (!email || !password) throw Object.assign(new Error("Admin login credentials are not configured"), { status: 503 });
  let authUser = await supabaseAuth.adminFindUserByEmail(email);
  if (!authUser) {
    const created = await supabaseAuth.adminCreateUser({ email, password, emailConfirmed: true, data: { name: "EcoStream Administrator", role: "admin" } });
    authUser = created.user;
  } else if (repairPassword) {
    await supabaseAuth.adminUpdateUser(authUser.id, { password, email_confirm: true, user_metadata: { ...(authUser.user_metadata || {}), name: authUser.user_metadata?.name || "EcoStream Administrator", role: "admin" } });
  } else if (!authUser.email_confirmed_at) {
    await supabaseAuth.adminUpdateUser(authUser.id, { email_confirm: true, user_metadata: { ...(authUser.user_metadata || {}), name: authUser.user_metadata?.name || "EcoStream Administrator", role: "admin" } });
  }
  // The auth trigger may provision a client profile first; immediately enforce
  // the configured admin identity/role server-side.
  const { url } = (() => {
    const u = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const k = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!u || !k) throw Object.assign(new Error("Supabase service role configuration is unavailable"), { status: 503 });
    return { url: u, key: k };
  })();
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ id: authUser.id, role: "admin", status: "active", name: "EcoStream Administrator", email })
  });
  if (!response.ok) throw Object.assign(new Error("Could not provision the configured admin profile"), { status: 503 });
  return authUser;
}

function registerSupabase(router) {
  router.post("/api/auth/admin-login", adminLoginRateLimit, async (req, res) => {
    const { email, password } = req.body;
    requireFields(req.body, ["email", "password"]);
    const configuredEmail = String(process.env.ADMIN_LOGIN_EMAIL || "").trim().toLowerCase();
    const configuredPassword = String(process.env.ADMIN_LOGIN_PASSWORD || "");
    if (!configuredEmail || !configuredPassword || String(email).trim().toLowerCase() !== configuredEmail || String(password) !== configuredPassword) {
      return sendJSON(res, 401, { error: "Invalid administrator credentials" });
    }
    try {
      let session;
      let authUser;
      try {
        // Primary path: authenticate directly. A privileged Admin API outage must
        // never block a correctly configured administrator from signing in.
        session = await supabaseAuth.signIn({ email: configuredEmail, password: configuredPassword });
        authUser = await supabaseAuth.getUser(session.access_token);
      } catch (firstErr) {
        // Recovery path: if the configured admin identity is missing or its password
        // is stale, repair/provision it server-side and retry once.
        if (![400, 401].includes(firstErr?.status)) throw firstErr;
        authUser = await ensureConfiguredAdmin({ repairPassword: true });
        session = await supabaseAuth.signIn({ email: configuredEmail, password: configuredPassword });
        authUser = await supabaseAuth.getUser(session.access_token);
      }
      const profile = await requireProfile(session.access_token, authUser.id);
      if (!profile || profile.role !== "admin") return sendJSON(res, 403, { error: "Administrator profile is not authorized." });
      sendJSON(res, 200, { token: session.access_token, refreshToken: session.refresh_token, user: { ...profile, email: configuredEmail, role: "admin", authProvider: "supabase" } });
    } catch (err) {
      const detailCode = err?.details?.code || err?.details?.error_code || "";
      const detailMessage = err?.details?.msg || err?.details?.message || err?.message || "";
      require("../lib/logger").logger.error("Administrator authentication failed", {
        status: err?.status || 500,
        code: detailCode,
        message: detailMessage,
      });
      if (err.status === 400 || err.status === 401) return sendJSON(res, 401, { error: "Administrator authentication failed" });
      if (err.status === 503) return sendJSON(res, 503, { error: "Administrator authentication service is not configured correctly. Please contact the system engineer." });
      throw err;
    }
  });

  // Customer accounts use Supabase Auth for identity, but deliberately do NOT
  // depend on Supabase Phone/SMS. The phone number is the app-facing login
  // identifier; Supabase stores an internal confirmed email identity so the
  // account works while SMS is disabled. SMS can be enabled later without
  // changing the customer-facing account model.
  async function provisionClientProfile(authUser, { name, phone, address }) {
    const profileUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!profileUrl || !key) throw Object.assign(new Error("Supabase service role configuration is unavailable"), { status: 503 });
    const response = await fetch(`${profileUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: authUser.id, role: "client", status: "active", name: String(name).trim(), phone, address: address || "" })
    });
    if (!response.ok) throw Object.assign(new Error("Could not provision the customer profile"), { status: 503 });
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] : rows;
  }

  router.post("/api/auth/register", async (req, res) => {
    const { name, phone, pin, address } = req.body;
    requireFields(req.body, ["name", "phone", "pin"]);
    if (String(name).trim().length < 2) throw new ValidationError("Enter your full name");
    validatePin(pin);
    const normalizedPhone = normalizePhoneInput(phone);
    try {
      if (await supabaseAuth.adminFindUserByPhone(normalizedPhone)) {
        return sendJSON(res, 409, { error: "An account with this phone number already exists" });
      }
      const email = supabaseAuth.internalAuthEmail(normalizedPhone);
      const created = await supabaseAuth.adminCreateUser({
        email,
        password: String(pin),
        emailConfirmed: true,
        data: { name: String(name).trim(), phone: normalizedPhone, role: "client", address: address || "" }
      });
      const profile = await provisionClientProfile(created.user, { name, phone: normalizedPhone, address });
      const session = await supabaseAuth.signIn({ email, password: String(pin) });
      sendJSON(res, 201, {
        message: "Account created successfully. No SMS verification is required.",
        token: session.access_token,
        refreshToken: session.refresh_token,
        user: { ...profile, phone: normalizedPhone, role: "client", authProvider: "supabase" }
      });
    } catch (err) {
      if (err.status === 422 || /already registered|already exists|user_already_exists/i.test(err.message)) {
        return sendJSON(res, 409, { error: "An account with this phone number already exists" });
      }
      throw err;
    }
  });

  // Kept as a compatibility endpoint only. It never sends SMS or calls the
  // Supabase phone verification API while SMS is disabled.
  router.post("/api/auth/verify-phone", async (req, res) => {
    sendJSON(res, 410, { error: "Phone/SMS verification is disabled for EcoStream right now. No verification code is required." });
  });

  router.post("/api/auth/login", customerLoginRateLimit, async (req, res) => {
    const { phone, pin } = req.body;
    requireFields(req.body, ["phone", "pin"]);
    validatePin(pin);
    try {
      const normalizedPhone = normalizePhoneInput(phone);
      const authUser = await supabaseAuth.adminFindUserByPhone(normalizedPhone);
      if (!authUser?.email) return sendJSON(res, 401, { error: "Invalid phone number or PIN" });
      const session = await supabaseAuth.signIn({ email: authUser.email, password: String(pin) });
      const profile = session.user ? await requireProfile(session.access_token, session.user.id) : null;
      if (!profile) return sendJSON(res, 403, { error: "Your EcoStream profile is not available. Contact support." });
      if (profile.status === "suspended") return sendJSON(res, 403, { error: "This account has been suspended. Contact support." });
      sendJSON(res, 200, {
        token: session.access_token,
        refreshToken: session.refresh_token,
        user: { ...profile, phone: session.user?.phone || profile.phone, authProvider: "supabase" }
      });
    } catch (err) {
      if (err.status === 400 || err.status === 401) return sendJSON(res, 401, { error: "Invalid phone number or PIN" });
      throw err;
    }
  });

  router.post("/api/auth/refresh", async (req, res) => {
    const { refreshToken } = req.body;
    requireFields(req.body, ["refreshToken"]);
    try {
      const session = await supabaseAuth.refresh(refreshToken);
      sendJSON(res, 200, { token: session.access_token, refreshToken: session.refresh_token });
    } catch (err) {
      return sendJSON(res, 401, { error: "Refresh token is invalid, expired, or has been revoked" });
    }
  });

  router.post("/api/auth/logout", authenticate, async (req, res) => {
    try { await supabaseAuth.signOut(req.user.accessToken); } catch (err) {
      if (![401, 403].includes(err.status)) throw err;
    }
    sendJSON(res, 200, { message: "Logged out" });
  });

  router.post("/api/auth/forgot-pin", async (req, res) => {
    sendJSON(res, 200, { message: "For security, EcoStream PIN resets are handled by authorized support staff. Please contact EcoStream." });
  });

  router.post("/api/auth/reset-password", authenticate, async (req, res) => {
    const { newPassword } = req.body;
    requireFields(req.body, ["newPassword"]);
    validatePin(newPassword);
    await supabaseAuth.updateUser(req.user.accessToken, { password: String(newPassword) });
    sendJSON(res, 200, { message: "PIN has been updated successfully." });
  });

  router.get("/api/auth/profile", authenticate, async (req, res) => {
    sendJSON(res, 200, { user: { ...req.user.profile, phone: req.user.authUser?.phone || req.user.profile?.phone } });
  });

  router.put("/api/auth/profile", authenticate, async (req, res) => {
    const patch = {};
    if (req.body.name) patch.name = String(req.body.name).trim();
    if (req.body.phone) patch.phone = normalizePhoneInput(req.body.phone);
    if (req.body.address !== undefined) patch.address = req.body.address;

    if (req.body.phone) {
      const existing = await supabaseAuth.adminFindUserByPhone(patch.phone);
      if (existing && existing.id !== req.user.id) {
        return sendJSON(res, 409, { error: "An account with this phone number already exists" });
      }
      // Phone + PIN login is backed by the deterministic internal Auth email.
      // Update that identity server-side and keep metadata synchronized.
      await supabaseAuth.adminUpdatePhoneIdentity(req.user.id, patch.phone);
    }

    if (req.body.name) {
      const metadata = {
        ...(req.user.authUser.user_metadata || {}),
        name: patch.name,
        ...(req.body.phone ? { phone: patch.phone } : {}),
      };
      await supabaseAuth.updateUser(req.user.accessToken, { data: metadata });
    }

    const profile = await getRequestDb(req).collection("profiles").updateById(req.user.id, patch);
    if (!profile) return sendJSON(res, 404, { error: "User profile not found" });
    sendJSON(res, 200, { user: { ...profile, phone: patch.phone || req.user.authUser?.phone || profile.phone } });
  });
}

async function requireProfile(accessToken, userId) {
  return getRequestDb({ user: { accessToken } }).collection("profiles").findById(userId);
}

function register(router) {
  if (String(process.env.AUTH_PROVIDER || "json").toLowerCase() === "supabase") return registerSupabase(router);

  // ---------- POST /api/auth/register (clients only self-register) ----------
  // Response contains only credentials and public account data. Verification
  // tokens are delivered through the configured transactional email provider.
  router.post("/api/auth/register", async (req, res) => {
    const { name, email, phone, address, password } = req.body;
    requireFields(req.body, ["name", "email", "phone", "password"]);
    if (!isEmail(email)) throw new ValidationError("Invalid email address");
    if (password.length < 8) throw new ValidationError("Password must be at least 8 characters");

    const users = db.collection("users");
    if (await users.findOne((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new ValidationError("An account with this email already exists");
    }

    const emailVerificationToken = genResetToken();
    const user = await users.insert({
      id: genId("u"),
      role: "client",
      status: "active",
      name,
      email: email.toLowerCase(),
      phone,
      address: address || "",
      password: hashPassword(password),
      emailVerified: false,
      emailVerificationToken: hashToken(emailVerificationToken),
      emailVerificationTokenExpires: Date.now() + 1000 * 60 * 60 * 24,
      failedLoginAttempts: 0,
      lockUntil: null,
      createdAt: new Date().toISOString(),
    });

    const token = signToken({ id: user.id, role: user.role, name: user.name });
    const refreshToken = await createSession(req, user);
    await audit({ user: { id: user.id, name: user.name, role: user.role } }, "register", { email: user.email });

    try {
      await sendEmail({
      to: user.email,
      subject: "Verify your EcoStream account",
      text: `Hello ${user.name},\n\nVerify your EcoStream account using this token: ${emailVerificationToken}\n\nThis token should only be used once.`,
      html: `<p>Hello ${user.name},</p><p>Verify your EcoStream account using the token below:</p><p><strong>${emailVerificationToken}</strong></p><p>This token should only be used once.</p>`,
      });
    } catch (err) {
      await db.collection("users").removeById(user.id);
      const session = await findValidSession(refreshToken);
      if (session) await revokeSession(session.id);
      return sendJSON(res, 503, { error: "Account creation is temporarily unavailable. Please try again later." });
    }
    sendJSON(res, 201, { token, refreshToken, user: publicUser(user) });
  });

  // ---------- POST /api/auth/verify-email ----------
  router.post("/api/auth/verify-email", async (req, res) => {
    const { token } = req.body;
    requireFields(req.body, ["token"]);
    const users = db.collection("users");
    const user = await users.findOne((u) => u.emailVerificationToken === hashToken(token));
    if (!user || !user.emailVerificationTokenExpires || Date.now() > user.emailVerificationTokenExpires) return sendJSON(res, 400, { error: "Verification token is invalid or expired" });
    await users.updateById(user.id, { emailVerified: true, emailVerificationToken: null, emailVerificationTokenExpires: null });
    await audit({ user: { id: user.id, name: user.name, role: user.role } }, "email_verified", {});
    sendJSON(res, 200, { message: "Email verified successfully." });
  });

  // ---------- POST /api/auth/login ----------
  router.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    requireFields(req.body, ["email", "password"]);

    const users = db.collection("users");
    const user = await users.findOne((u) => u.email.toLowerCase() === String(email).toLowerCase());

    if (!user) {
      await audit({ user: null }, "login_failed", { email });
      return sendJSON(res, 401, { error: "Invalid email or password" });
    }

    // ---------- account lockout ----------
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      await audit({ user: { id: user.id, name: user.name, role: user.role } }, "login_blocked_locked", { minutesLeft });
      return sendJSON(res, 423, { error: `Account temporarily locked after too many failed attempts. Try again in ${minutesLeft} minute(s).` });
    }

    if (!verifyPassword(password, user.password)) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const patch = { failedLoginAttempts: attempts };
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        patch.lockUntil = Date.now() + LOCK_DURATION_MS;
        await audit({ user: { id: user.id, name: user.name, role: user.role } }, "account_locked", { attempts });
      }
      await users.updateById(user.id, patch);
      await audit({ user: null }, "login_failed", { email, attempts });
      return sendJSON(res, 401, { error: "Invalid email or password" });
    }

    if (user.status === "suspended") {
      await audit({ user: { id: user.id, name: user.name, role: user.role } }, "login_blocked_suspended", {});
      return sendJSON(res, 403, { error: "This account has been suspended. Contact support." });
    }

    // successful login — reset lockout counters
    if (user.failedLoginAttempts || user.lockUntil) {
      await users.updateById(user.id, { failedLoginAttempts: 0, lockUntil: null });
    }

    const token = signToken({ id: user.id, role: user.role, name: user.name });
    const refreshToken = await createSession(req, user);
    await audit({ user: { id: user.id, name: user.name, role: user.role } }, "login", { device: req.headers["user-agent"] });
    sendJSON(res, 200, { token, refreshToken, user: publicUser(user) });
  });

  // ---------- POST /api/auth/refresh ----------
  // Exchanges a valid, unexpired, unrevoked refresh token for a new access
  // token. The refresh token itself is rotated (old one revoked, new one
  // issued) on every use — standard practice so a leaked-then-reused old
  // refresh token is detectable/stale rather than silently still valid.
  router.post("/api/auth/refresh", async (req, res) => {
    const { refreshToken } = req.body;
    requireFields(req.body, ["refreshToken"]);
    const session = await findValidSession(refreshToken);
    if (!session) return sendJSON(res, 401, { error: "Refresh token is invalid, expired, or has been revoked" });

    const user = await db.collection("users").findById(session.userId);
    if (!user) return sendJSON(res, 401, { error: "Account no longer exists" });
    if (user.status === "suspended") return sendJSON(res, 403, { error: "This account has been suspended." });

    const newRefreshToken = await rotateSession(session, req);
    const token = signToken({ id: user.id, role: user.role, name: user.name });
    sendJSON(res, 200, { token, refreshToken: newRefreshToken });
  });

  // ---------- POST /api/auth/logout ----------
  // Revokes the session tied to the supplied refreshToken (if any) in
  // addition to the client discarding its access token — this is what makes
  // "sign out" actually revoke server-side state instead of just forgetting
  // a token that would otherwise keep working until it expires.
  router.post("/api/auth/logout", authenticate, async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const session = await findValidSession(refreshToken);
      if (session) await revokeSession(session.id);
    }
    sendJSON(res, 200, { message: "Logged out" });
  });

  // ---------- POST /api/auth/forgot-password ----------
  router.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body;
    requireFields(req.body, ["email"]);
    const users = db.collection("users");
    const user = await users.findOne((u) => u.email.toLowerCase() === String(email).toLowerCase());
    // Always return 200 even if the user doesn't exist — do not leak which
    // emails are registered.
    if (!user) return sendJSON(res, 200, { message: "If that email exists, a reset link has been sent." });

    const resetToken = genResetToken();
    await users.updateById(user.id, {
      resetToken: hashToken(resetToken),
      resetTokenExpires: Date.now() + 1000 * 60 * 30, // 30 min
    });

    try {
      await sendEmail({
      to: user.email,
      subject: "Reset your EcoStream password",
      text: `Hello ${user.name},

Use this password reset token within 30 minutes: ${resetToken}

If you did not request this, you can ignore this email.`,
      html: `<p>Hello ${user.name},</p><p>Use this password reset token within 30 minutes:</p><p><strong>${resetToken}</strong></p><p>If you did not request this, you can ignore this email.</p>`,
      });

    } catch (err) {
      require("../lib/logger").logger.error("Password reset email delivery failed", { message: err.message });
    }
    sendJSON(res, 200, { message: "If that email exists, a reset link has been sent." });
  });

  // ---------- POST /api/auth/reset-password ----------
  router.post("/api/auth/reset-password", async (req, res) => {
    const { token, newPassword } = req.body;
    requireFields(req.body, ["token", "newPassword"]);
    if (newPassword.length < 8) throw new ValidationError("Password must be at least 8 characters");

    const users = db.collection("users");
    const user = await users.findOne((u) => u.resetToken === hashToken(token));
    if (!user || !user.resetTokenExpires || Date.now() > user.resetTokenExpires) {
      return sendJSON(res, 400, { error: "Reset token is invalid or has expired" });
    }
    await users.updateById(user.id, {
      password: hashPassword(newPassword), resetToken: null, resetTokenExpires: null,
      failedLoginAttempts: 0, lockUntil: null, // a successful reset also clears any lockout
    });
    await audit({ user: { id: user.id, name: user.name, role: user.role } }, "password_reset", {});
    sendJSON(res, 200, { message: "Password has been reset. You can now log in." });
  });

  // ---------- GET /api/auth/profile ----------
  router.get("/api/auth/profile", authenticate, async (req, res) => {
    const user = await db.collection("users").findById(req.user.id);
    if (!user) return sendJSON(res, 404, { error: "User not found" });
    sendJSON(res, 200, { user: publicUser(user) });
  });

  // ---------- PUT /api/auth/profile ----------
  router.put("/api/auth/profile", authenticate, async (req, res) => {
    const { name, phone, address } = req.body;
    const patch = {};
    if (name) patch.name = name;
    if (phone) patch.phone = phone;
    if (address !== undefined) patch.address = address;
    const updated = await db.collection("users").updateById(req.user.id, patch);
    if (!updated) return sendJSON(res, 404, { error: "User not found" });
    sendJSON(res, 200, { user: publicUser(updated) });
  });
}

module.exports = { register, publicUser };