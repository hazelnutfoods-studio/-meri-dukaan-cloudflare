// Gmail's sending method does not work from Cloudflare, so email goes through Brevo or Resend instead (see README).
module.exports = { createTransport() { return { sendMail() { return Promise.reject(new Error("Gmail SMTP does not work on Cloudflare. Set BREVO_API_KEY (free) to send emails.")); } }; } };
