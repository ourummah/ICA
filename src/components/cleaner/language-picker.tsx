"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { LOCALES, type Locale } from "@/lib/i18n";

export function LanguagePicker({ value, onPick }: { value: Locale; onPick: (l: Locale) => void }) {
  const t = useTranslations("language");
  return (
    <section className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
      <ul className="flex flex-col gap-3">
        {LOCALES.map((l) => (
          <li key={l.code}>
            <button
              type="button"
              lang={l.code}
              onClick={() => onPick(l.code)}
              aria-pressed={value === l.code}
              className={`flex min-h-16 w-full items-center gap-4 rounded-xl border-2 px-4 text-xl font-semibold ${value === l.code ? "border-accent bg-accent/10" : "border-border bg-muted"}`}
            >
              <span className="text-3xl" aria-hidden>
                {l.flag}
              </span>
              <span className="flex-1 text-left">{l.nativeName}</span>
              {value === l.code ? <Check className="size-7 text-accent" aria-hidden /> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
