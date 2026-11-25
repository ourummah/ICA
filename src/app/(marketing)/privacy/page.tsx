import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · Intelligent Cleaning Audit" };

/** SPEC F9: placeholder, clearly marked for legal review. */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12">
      <p
        role="note"
        className="rounded-md border-2 border-status-amber bg-status-amber/10 px-4 py-3 text-sm font-semibold"
      >
        Placeholder: this privacy notice is a draft and has not been reviewed by a lawyer. It must be reviewed
        before ICA is used with real customer data.
      </p>
      <h1 className="text-3xl font-bold text-primary">Privacy notice</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Website demo requests</h2>
        <p>
          When you book a demo we keep the name, company, email, phone number and message you give us, and use
          them only to contact you about ICA. We don&apos;t sell or share them.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">The ICA app</h2>
        <p>
          ICA records cleaning work for food safety: who did each step, when, photos, timers, test results and
          notes. Cleaners see a notice about this before they first use the app. Records are stored in
          Australia (Sydney) and are visible only to people at the customer&apos;s site and organisation with
          access to them.
        </p>
        <p>
          Notes written in other languages may be translated to English by an AI service run on our servers.
          The original note is always kept and translations are labelled.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p>
          To ask about your data, use the demo request form on the home page and we&apos;ll get back to you.
        </p>
      </section>
    </main>
  );
}
