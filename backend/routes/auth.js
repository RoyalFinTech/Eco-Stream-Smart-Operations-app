const db = require("../lib/db");
const { getRequestDb } = require("../lib/requestDb");
const supabaseAuth = require("../lib/supabaseAuth");
const { hashPassword, verifyPassword, signToken, genId, genResetToken, hashToken } = require("../lib/auth");
const { sendEmail } = require("../lib/email");
const { sendJSON, authenticate } = require("../lib/router");
const { requireFields, isEmail, ValidationError } = require("../lib/validate");
const { audit } = require("../lib/audit");
const { createSession, findValidSession, revokeSession, rotateSession } = require("../lib/sessions");

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
function registerSupabase(router) {
  router.post("/api/auth/register", async (req, res) => {
    const { name, phone, pin, address } = req.body;
    requireFields(req.body, ["name", "phone", "pin"]);
    if (String(name).trim().length < 2) throw new ValidationError("Enter your full name");
    validatePin(pin);
    const normalizedPhone = normalizePhoneInput(phone);
    try {
      const result = await supabaseAuth.signUp({
        phone: normalizedPhone,
        password: String(pin),
        data: { name: String(name).trim(), phone: normalizedPhone, role: "client", address: address || "" }
      });
      const user = result.user;
      const profile = user && result.session ? await requireProfile(result.session.access_token, user.id) : null;
      if (result.session) {
        sendJSON(res, 201, {
          message: "Account created successfully.",
          token: result.session.access_token,
          refreshToken: result.session.refresh_token,
          user: { ...profile, phone: normalizedPhone, role: "client", authProvider: "supabase" }
        });
      } else {
        sendJSON(res, 202, {
          message: "Account created. Complete the phone verification code sent to your number before signing in.",
          verificationRequired: true,
          phone: normalizedPhone,
          user: user ? { id: user.id, phone: normalizedPhone, role: "client", name: String(name).trim() } : null
        });
      }
    } catch (err) {
      if (err.status === 422 || /already registered|already exists|user_already_exists/i.test(err.message)) {
        return sendJSON(res, 409, { error: "An account with this phone number already exists" });
      }
      throw err;
    }
  });

  router.post("/api/auth/verify-phone", async (req, res) => {
    const { phone, token } = req.body;
    requireFields(req.body, ["phone", "token"]);
    if (!/^\d{6}$/.test(String(token))) throw new ValidationError("Verification code must be 6 digits");
    try {
      const session = await supabaseAuth.verifyPhone(phone, token, "sms");
      const profile = session.user ? await requireProfile(session.access_token, session.user.id) : null;
      sendJSON(res, 200, {
        message: "Phone verified successfully.",
        token: session.access_token,
        refreshToken: session.refresh_token,
        user: { ...profile, phone: session.user?.phone, authProvider: "supabase" }
      });
    } catch (err) {
      if (err.status === 400 || err.status === 401) return sendJSON(res, 401, { error: "The verification code is invalid or expired." });
      throw err;
    }
  });

  router.post("/api/auth/login", async (req, res) => {
    const { phone, pin } = req.body;
    requireFields(req.body, ["phone", "pin"]);
    validatePin(pin);
    try {
      const session = await supabaseAuth.signIn({ phone, password: String(pin) });
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
    if (req.body.name) patch.name = req.body.name;
    if (req.body.phone) patch.phone = normalizePhoneInput(req.body.phone);
    if (req.body.address !== undefined) patch.address = req.body.address;
    const profile = await getRequestDb(req).collection("profiles").updateById(req.user.id, patch);
    if (!profile) return sendJSON(res, 404, { error: "User profile not found" });
    if (req.body.name) {
      await supabaseAuth.updateUser(req.user.accessToken, { data: { ...(req.user.authUser.user_metadata || {}), name: req.body.name } });
    }
    if (req.body.phone) {
      await supabaseAuth.updateUser(req.user.accessToken, { phone: patch.phone });
    }
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