// POST /api/submit-lead
// Body: { email, company, website, jobInput?, resumeTitle? }
//   website = a hidden "honeypot" field. People never see it; bots that fill
//   in every field do. A filled honeypot gets a quiet "ok" and no emails.
// Returns: { ok: true } | { error }
//
// Sends two emails FROM YOUR GMAIL, through Gmail's own mail server:
//   1. To the visitor — a thank-you from you, with the video walkthrough link
//      if one is configured. It sits in your Sent folder, and their reply
//      threads in your inbox like any other email.
//   2. To you — the lead itself: email, company, the role they matched, and
//      the resume title the site generated. Replying writes to the visitor.
// For V1 those emails ARE the lead log; a database can be added later
// without touching the site.
//
// Environment variables (set in Vercel → Settings → Environment Variables):
//   GMAIL_USER              required — your Gmail address
//   GMAIL_APP_PASSWORD      required — a 16-character Google App Password
//                           (needs 2-Step Verification; revocable any time).
//                           It's a key to your Gmail: it lives only in Vercel.
//   LEAD_NOTIFY_EMAIL       optional — where lead notifications go (defaults to GMAIL_USER)
//   WALKTHROUGH_VIDEO_URL   optional — included in the visitor's email when set
//
// Requires the "nodemailer" package (listed in package.json, which Vercel
// installs automatically on deploy).

const nodemailer = require("nodemailer");

const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

// ---- Built-in throttles ----
// Vercel's free plan allows one firewall rate-limit rule, shared by every
// endpoint. These limits add the stricter protection this endpoint needs,
// because it sends email from your personal Gmail:
//   • 3 submissions per visitor (IP address) per 10 minutes
//   • at most one thank-you per email address per day, so nobody can use the
//     form to repeatedly mail a single victim
//   • at most 20 thank-yous per hour in total — past that, you still get
//     every lead, flagged to follow up yourself; only the automatic email to
//     the visitor is skipped
// They live in the server's memory, which resets whenever Vercel recycles
// the function, so they're a strong second layer rather than a guarantee.
// If abuse ever shows up, a free Redis store (Upstash) can make them permanent.
const PER_IP_LIMIT = 3;
const PER_IP_WINDOW_MS = 10 * 60 * 1000;
const RECIPIENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const THANK_YOU_HOURLY_CAP = 20;
const HOUR_MS = 60 * 60 * 1000;
const ipHits = new Map();          // ip -> recent submission times
const lastThankYouTo = new Map();  // recipient -> time of their last thank-you
let thankYouTimes = [];            // when recent thank-yous went out

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.headers["x-real-ip"] || "unknown";
}

function allowSubmission(ip, now) {
  const recent = (ipHits.get(ip) || []).filter((t) => now - t < PER_IP_WINDOW_MS);
  const allowed = recent.length < PER_IP_LIMIT;
  if (allowed) recent.push(now);
  ipHits.set(ip, recent);
  if (ipHits.size > 5000) { // keep memory bounded under a flood
    for (const [key, times] of ipHits) if (!times.some((t) => now - t < PER_IP_WINDOW_MS)) ipHits.delete(key);
  }
  return allowed;
}

function allowThankYou(recipient, now) {
  thankYouTimes = thankYouTimes.filter((t) => now - t < HOUR_MS);
  const key = recipient.toLowerCase();
  const last = lastThankYouTo.get(key);
  if (last && now - last < RECIPIENT_COOLDOWN_MS) return "already sent to this address today";
  if (thankYouTimes.length >= THANK_YOU_HOURLY_CAP) return "hourly limit reached";
  thankYouTimes.push(now);
  lastThankYouTo.set(key, now);
  if (lastThankYouTo.size > 5000) {
    for (const [k, t] of lastThankYouTo) if (now - t >= RECIPIENT_COOLDOWN_MS) lastThankYouTo.delete(k);
  }
  return null; // allowed
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ---- Abuse guards ----
  // This is the one endpoint that emails an address a stranger types in —
  // from YOUR Gmail — so it's guarded more tightly than the others:
  // same-origin only, small payloads, strict validation, and (in the Vercel
  // firewall) a tight rate limit. Abuse here would hurt your Gmail account's
  // standing, not just this site.
  const origin = req.headers.origin || req.headers.referer || "";
  if (!req.headers.host || !origin.includes(req.headers.host)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (JSON.stringify(req.body || {}).length > 10000) {
    return res.status(400).json({ error: "Payload too large" });
  }
  const body = req.body || {};
  const now = Date.now();

  if (!allowSubmission(clientIp(req), now)) {
    console.warn("submit-lead: too many submissions from one visitor — throttled");
    return res.status(429).json({ error: "rate_limited" });
  }

  if (typeof body.website === "string" && body.website.trim() !== "") {
    console.warn("submit-lead: honeypot filled — ignoring as a bot");
    return res.status(200).json({ ok: true });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const company = clean(body.company, 120);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (!company) {
    return res.status(400).json({ error: "Please enter your company." });
  }
  const jobInput = clean(body.jobInput, 2000, { keepNewlines: true });
  const resumeTitle = clean(body.resumeTitle, 200);
  // ----------------------

  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error("submit-lead: not configured — set GMAIL_USER and GMAIL_APP_PASSWORD in Vercel");
    return res.status(500).json({ error: "not_configured" });
  }
  const notifyTo = process.env.LEAD_NOTIFY_EMAIL || GMAIL_USER;
  const videoUrl = process.env.WALKTHROUGH_VIDEO_URL || "";
  const siteUrl = `https://${req.headers.host}`;
  const from = { name: "Christian Schlaefer", address: GMAIL_USER };
  const transport = getTransport(GMAIL_USER, GMAIL_APP_PASSWORD);

  // Decide BEFORE sending whether the visitor gets an automatic thank-you;
  // if not, your notification says so, so you know to follow up yourself.
  const skippedReason = allowThankYou(email, now);
  const notification = {
    from,
    to: notifyTo,
    replyTo: email, // hit Reply to write straight back to the visitor
    subject: `New resume lead: ${company}`,
    html: notificationHtml({ email, company, jobInput, resumeTitle, siteUrl, skippedReason }),
    text: notificationText({ email, company, jobInput, resumeTitle, siteUrl, skippedReason })
  };
  const thankYou = {
    from,
    to: email,
    subject: "Thanks for visiting — Christian Schlaefer",
    html: thankYouHtml({ videoUrl, siteUrl }),
    text: thankYouText({ videoUrl, siteUrl })
  };

  // Both at once. The notification matters most — it's how you get the lead.
  const [notified, thanked] = await Promise.allSettled([
    transport.sendMail(notification),
    skippedReason ? Promise.resolve("skipped") : transport.sendMail(thankYou)
  ]);
  if (skippedReason) console.warn(`submit-lead: automatic thank-you skipped (${skippedReason})`);
  if (notified.status === "rejected") console.error("submit-lead: notification failed:", notified.reason.message);
  if (thanked.status === "rejected") console.error("submit-lead: visitor thank-you failed:", thanked.reason.message);

  if (notified.status === "rejected" && thanked.status === "rejected") {
    return res.status(502).json({ error: "send_failed" });
  }
  console.log(`submit-lead: lead from ${company} — notification ${notified.status}, thank-you ${thanked.status}`);
  return res.status(200).json({ ok: true });
};

// One connection setup per warm server instance, reused across requests.
let cachedTransport = null;
function getTransport(user, pass) {
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      service: "gmail", // Gmail's own SMTP server (smtp.gmail.com, secure)
      auth: { user, pass: pass.replace(/\s+/g, "") } // Google displays the code with spaces
    });
  }
  return cachedTransport;
}

// Trims, caps length, and strips control characters (and newlines, unless
// asked to keep them) from anything the visitor typed.
function clean(value, maxLength, { keepNewlines = false } = {}) {
  if (typeof value !== "string") return "";
  const pattern = keepNewlines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return value.replace(pattern, " ").trim().slice(0, maxLength);
}

// Visitor text is escaped before it goes into an email, so nobody can inject
// links or markup into the notification you receive.
function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const wrap = (inner) =>
  `<div style="font-family: Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.6; color: #1d2b3a; max-width: 560px;">${inner}</div>`;

function thankYouHtml({ videoUrl, siteUrl }) {
  const video = videoUrl
    ? `<p>In the meantime, here's the short video walkthrough of how the site was built: <a href="${esc(videoUrl)}">watch the walkthrough</a>.</p>`
    : `<p>I'll include a short video walkthrough of how the site was built when I follow up.</p>`;
  return wrap(
    `<p>Hi there,</p>` +
    `<p>Thanks for taking the time to explore my interactive resume. I'll be in touch personally soon.</p>` +
    video +
    `<p>Just reply to this email any time — it comes straight to me. You can also <a href="${esc(siteUrl)}">revisit the site</a>.</p>` +
    `<p>Best,<br>Christian Schlaefer</p>`
  );
}

function thankYouText({ videoUrl, siteUrl }) {
  return [
    "Hi there,",
    "",
    "Thanks for taking the time to explore my interactive resume. I'll be in touch personally soon.",
    "",
    videoUrl
      ? `In the meantime, here's the short video walkthrough of how the site was built: ${videoUrl}`
      : "I'll include a short video walkthrough of how the site was built when I follow up.",
    "",
    `Just reply to this email any time — it comes straight to me. You can also revisit the site: ${siteUrl}`,
    "",
    "Best,",
    "Christian Schlaefer"
  ].join("\n");
}

function notificationHtml({ email, company, jobInput, resumeTitle, siteUrl, skippedReason }) {
  const row = (label, value) =>
    `<tr><td style="padding: 4px 16px 4px 0; color: #5e6a77; vertical-align: top;">${label}</td><td style="padding: 4px 0;">${value}</td></tr>`;
  return wrap(
    `<p><strong>Someone left their details on your resume site.</strong> Reply to this email to write back to them.</p>` +
    (skippedReason
      ? `<p style="padding: 8px 12px; background: #fbeaec; color: #7e2633;"><strong>No automatic thank-you was sent</strong> (${esc(skippedReason)}) — follow up yourself if this is a real lead.</p>`
      : "") +
    `<table style="border-collapse: collapse; font-size: 15px;">` +
    row("Email", `<a href="mailto:${esc(email)}">${esc(email)}</a>`) +
    row("Company", esc(company)) +
    row("Resume title shown", resumeTitle ? esc(resumeTitle) : "—") +
    row("Received", new Date().toUTCString()) +
    `</table>` +
    `<p style="margin-top: 20px; color: #5e6a77;">What they entered on the welcome card:</p>` +
    `<blockquote style="margin: 0; padding: 8px 14px; border-left: 3px solid #c3cdd3; white-space: pre-wrap;">${jobInput ? esc(jobInput) : "(left blank)"}</blockquote>` +
    `<p style="margin-top: 20px; font-size: 13px; color: #8a949e;">Sent by ${esc(siteUrl)}</p>`
  );
}

function notificationText({ email, company, jobInput, resumeTitle, siteUrl, skippedReason }) {
  return [
    "Someone left their details on your resume site. Reply to this email to write back to them.",
    ...(skippedReason ? ["", `NOTE: No automatic thank-you was sent (${skippedReason}) — follow up yourself if this is a real lead.`] : []),
    "",
    `Email: ${email}`,
    `Company: ${company}`,
    `Resume title shown: ${resumeTitle || "—"}`,
    `Received: ${new Date().toUTCString()}`,
    "",
    "What they entered on the welcome card:",
    jobInput || "(left blank)",
    "",
    `Sent by ${siteUrl}`
  ].join("\n");
}
