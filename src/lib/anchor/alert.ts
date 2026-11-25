import "server-only";

/**
 * Emails an anchoring alert through Resend when RESEND_API_KEY and ANCHOR_ALERT_EMAIL are set.
 * Always logs, so alerts also show in the Vercel function logs.
 */
export async function sendAnchorAlert(subject: string, text: string): Promise<void> {
  console.error(`[anchor alert] ${subject}: ${text}`);
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ANCHOR_ALERT_EMAIL;
  if (!key || !to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.DEMO_REQUEST_FROM_EMAIL || "ICA alerts <onboarding@resend.dev>",
        to: to.split(",").map((s) => s.trim()),
        subject,
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("anchor alert email failed", res.status);
  } catch (e) {
    console.error("anchor alert email failed", e instanceof Error ? e.message : e);
  }
}
