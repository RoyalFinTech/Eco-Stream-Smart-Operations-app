// Minimal provider-agnostic transactional email adapter.
// Configure EMAIL_WEBHOOK_URL to a trusted email service endpoint in production.
// The endpoint receives JSON: {to, subject, text, html}.

async function sendEmail({ to, subject, text, html }) {
  const url = process.env.EMAIL_WEBHOOK_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("EMAIL_WEBHOOK_URL is required in production");
    }
    console.log(`[email:dev] to=${to} subject=${subject}\n${text}`);
    return { delivered: false, mode: "development" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(process.env.EMAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}` } : {}) },
    body: JSON.stringify({ to, subject, text, html }),
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
  return { delivered: true, mode: "webhook" };
}

module.exports = { sendEmail };