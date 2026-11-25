// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { clientIp, demoRequestSchema, notificationText } from "./demo-request";
import { notifyDemoRequest } from "./notify";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("demo request form", () => {
  it("accepts a minimal request and drops empty optional fields", () => {
    const r = demoRequestSchema.parse({
      name: " Alex ",
      email: "alex@example.com",
      company: "",
      phone: "  ",
    });
    expect(r).toEqual({ name: "Alex", email: "alex@example.com" });
  });

  it("rejects a missing name, a bad email and over-long text", () => {
    expect(demoRequestSchema.safeParse({ name: "", email: "a@example.com" }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ name: "A", email: "not-an-email" }).success).toBe(false);
    expect(
      demoRequestSchema.safeParse({ name: "A", email: "a@example.com", message: "x".repeat(2001) }).success,
    ).toBe(false);
  });

  it("uses the first forwarded address for rate limiting", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("formats the notification email", () => {
    const text = notificationText({ name: "Alex", email: "alex@example.com", company: "Example Foods" });
    expect(text).toContain("Company: Example Foods");
    expect(text).toContain("Phone: -");
    expect(text).toContain("(no message)");
  });
});

describe("notifyDemoRequest", () => {
  it("does nothing unless Resend is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await notifyDemoRequest({ name: "A", email: "a@example.com" })).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends through Resend with a reply-to of the requester", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("DEMO_REQUEST_NOTIFY_EMAIL", "sales@example.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await notifyDemoRequest({ name: "A", email: "a@example.com" })).toBe("sent");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body)) as { to: string[]; reply_to: string };
    expect(body.to).toEqual(["sales@example.com"]);
    expect(body.reply_to).toBe("a@example.com");
  });

  it("reports a failed send without throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("DEMO_REQUEST_NOTIFY_EMAIL", "sales@example.com");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 422 })));
    expect(await notifyDemoRequest({ name: "A", email: "a@example.com" })).toBe("failed");
  });
});
