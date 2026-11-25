import {
  Camera,
  ClipboardCheck,
  FileCheck2,
  Languages,
  Link2,
  ShieldCheck,
  Siren,
  Smartphone,
  Timer,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

/**
 * Website copy in one place so it can be edited without touching layout (SPEC F9). Written from the
 * product spec; check it against the ICA Sales Overview deck before launch.
 */
export const hero = {
  eyebrow: "Sanitation compliance for food processors",
  title: "Proof that every clean was done right.",
  body: "ICA guides night-shift cleaners step by step, captures the evidence as they go, and tells your QA team which zones are ready before production starts. It works in wet rooms, with gloves on and no signal.",
};

export const problems = [
  {
    title: "Paper sign-offs prove very little",
    body: "A tick and a signature at 5 am doesn't show that the foam stayed on long enough or that the underside of the belt was checked.",
  },
  {
    title: "Problems surface too late",
    body: "A failed swab or a skipped step is often found at pre-op, or by an auditor weeks later, when it is expensive to fix.",
  },
  {
    title: "Crews speak many languages",
    body: "Instructions in dense English and notes nobody can read mean steps get missed and issues never reach the supervisor.",
  },
  {
    title: "Audit prep takes days",
    body: "Pulling together cleaning records, swab results and corrective actions from folders and spreadsheets is slow, and gaps show.",
  },
];

export const steps: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: "Capture",
    body: "Cleaners follow your SSOP on a shared phone: one step per screen, photos, dwell timers and ATP readings, in their own language. Everything saves on the device first, even offline.",
    icon: Camera,
  },
  {
    title: "Checks",
    body: "As the phone syncs, ICA flags skipped steps, short dwell times, failed swabs and clock problems, and turns the zone tile red, amber or green.",
    icon: Siren,
  },
  {
    title: "Pre-op alerts",
    body: "Supervisors see what needs attention before the shift ends and send work back for a re-clean. QA completes the pre-op check and releases each zone.",
    icon: ClipboardCheck,
  },
  {
    title: "Audit pack",
    body: "Download a PDF and CSV for any date range: every step, photo, exception, resolution and release, with a record-integrity check on the cover.",
    icon: FileCheck2,
  },
];

export const features: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: "Works with no signal",
    body: "Records are written to the phone first and sync when signal returns. Nothing is lost if the app closes or the battery dies.",
    icon: WifiOff,
  },
  {
    title: "Built for gloves",
    body: "Big buttons, pictures and short labels on every cleaner screen. Sign in with a name tile and a 4-digit PIN.",
    icon: Smartphone,
  },
  {
    title: "In your crew's language",
    body: "Cleaner screens in English, Tagalog and Bahasa Indonesia. Notes are translated for supervisors and clearly labelled as AI translations, with the original kept.",
    icon: Languages,
  },
  {
    title: "Timers and swabs that count",
    body: "Dwell timers run on the device, and ATP readings are checked against your limits on the spot.",
    icon: Timer,
  },
  {
    title: "Records you can trust",
    body: "Every record is chained to the one before it, so any change shows. Corrections are added as new records; nothing is overwritten.",
    icon: Link2,
  },
  {
    title: "People decide",
    body: "AI helps with translation, but only people pass a clean or release a zone. Every decision shows who made it and when.",
    icon: ShieldCheck,
  },
];

export const pilot = {
  title: "Founding pilot",
  body: "We're looking for a small number of meat, poultry, smallgoods and dairy processors, and contract sanitation companies, to run ICA on a few zones for a short pilot.",
  points: [
    "We set up your zones, equipment and SSOPs with you",
    "Runs on phones you already have; no hardware to buy",
    "Direct line to the founder for feedback and changes",
    "Founding-customer terms if you continue",
  ],
};

/** Only shown when SHOW_PRICING=true. Replace with real pricing before turning it on. */
export const pricing = {
  title: "Pricing",
  body: "Priced per site, with founding-customer terms for pilot sites. Ask us for a quote in the form below.",
};
