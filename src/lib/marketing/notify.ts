import "server-only";

import { notificationText, type DemoRequestInput } from "./demo-request";

/**
 * Emails a new demo request through Resend when RESEND_API_KEY and DEMO_REQUEST_NOTIFY_EMAIL are
 * set. Otherwise does nothing: the request is already saved in demo_requests either way.
 */
export async function notifyDemoRequest(r: DemoRequestInput): Promise<"sent" | "skipped" | "failed"> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.DEMO_REQUEST_NOTIFY_EMAIL;
  if (!key || !to) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.DEMO_REQUEST_FROM_EMAIL || "ICA website <onboarding@resend.dev>",
        to: to.split(",").map((s) => s.trim()),
        reply_to: r.email,
        subject: `Demo request: ${r.name}${r.company ? `, ${r.company}` : ""}`,
        text: notificationText(r),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("demo request email failed", res.status, await res.text().catch(() => ""));
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("demo request email failed", e instanceof Error ? e.message : e);
    return "failed";
  }
}
