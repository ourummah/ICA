"use client";

import { Delete } from "lucide-react";
import { useTranslations } from "next-intl";

/** Big numeric keypad for gloved hands: PIN entry and ATP readings. */
export function Keypad({
  value,
  onChange,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength: number;
  disabled?: boolean;
}) {
  const t = useTranslations("signIn");
  const press = (d: string) => value.length < maxLength && onChange(value + d);
  const key =
    "flex h-16 items-center justify-center rounded-xl border-2 border-border bg-muted text-3xl font-semibold active:bg-accent active:text-accent-foreground disabled:opacity-50";
  return (
    <div className="grid grid-cols-3 gap-3" role="group" aria-label="Keypad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} type="button" className={key} onClick={() => press(d)} disabled={disabled}>
          {d}
        </button>
      ))}
      <button type="button" className={`${key} text-lg`} onClick={() => onChange("")} disabled={disabled}>
        {t("clear")}
      </button>
      <button type="button" className={key} onClick={() => press("0")} disabled={disabled}>
        0
      </button>
      <button
        type="button"
        className={key}
        onClick={() => onChange(value.slice(0, -1))}
        disabled={disabled}
        aria-label={t("deleteDigit")}
      >
        <Delete className="size-8" aria-hidden />
      </button>
    </div>
  );
}
