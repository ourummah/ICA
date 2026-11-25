"use client";

import { ChevronLeft, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Keypad } from "./keypad";
import type { Cleaner } from "./types";

const MAX_TRIES = 5;
const LOCKOUT_SECONDS = 30;

export function SignIn({
  cleaners,
  verify,
  onSignedIn,
}: {
  cleaners: Cleaner[];
  verify: (profileId: string, pin: string) => Promise<boolean>;
  onSignedIn: (cleaner: Cleaner) => void;
}) {
  const t = useTranslations("signIn");
  const [selected, setSelected] = useState<Cleaner | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [lockedUntil]);
  const locked = lockedUntil !== null && now < lockedUntil;

  const check = (candidate: Cleaner, value: string) => {
    setChecking(true);
    verify(candidate.profileId, value)
      .then((ok) => {
        if (ok) {
          onSignedIn(candidate);
          return;
        }
        const next = tries + 1;
        setTries(next);
        setPin("");
        if (next >= MAX_TRIES) {
          setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
          setNow(Date.now());
          setTries(0);
        }
        setError(t("wrongPin"));
      })
      .catch(() => {
        setPin("");
        setError(t("wrongPin"));
      })
      .finally(() => setChecking(false));
  };

  const onPinChange = (value: string) => {
    setError(null);
    setPin(value);
    if (value.length === 4 && selected && !checking) check(selected, value);
  };

  if (!selected) {
    return (
      <section className="flex flex-col gap-4 p-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">{t("title")}</h1>
          <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
        </div>
        {cleaners.length === 0 ? <p className="text-lg">{t("noCleaners")}</p> : null}
        <ul className="grid grid-cols-2 gap-3">
          {cleaners.map((c) => (
            <li key={c.profileId}>
              <button
                type="button"
                onClick={() => {
                  setSelected(c);
                  setError(null);
                }}
                className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-muted p-3 text-lg font-semibold active:border-accent"
              >
                <UserRound className="size-10 text-accent" aria-hidden />
                {c.displayName}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 p-4">
      <button
        type="button"
        onClick={() => {
          setSelected(null);
          setPin("");
          setError(null);
        }}
        className="flex min-h-14 items-center gap-1 self-start text-lg font-medium text-accent"
      >
        <ChevronLeft className="size-6" aria-hidden /> {selected.displayName}
      </button>
      <h1 className="text-2xl font-bold text-primary">{t("enterPin")}</h1>
      <div className="flex justify-center gap-4" aria-label={`${pin.length} of 4`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`size-6 rounded-full border-2 border-primary ${i < pin.length ? "bg-primary" : ""}`}
          />
        ))}
      </div>
      {locked ? (
        <p role="alert" className="text-center text-lg font-semibold text-destructive">
          {t("lockedOut", { seconds: Math.ceil(((lockedUntil ?? 0) - now) / 1000) })}
        </p>
      ) : error ? (
        <p role="alert" className="text-center text-lg font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      <Keypad value={pin} onChange={onPinChange} maxLength={4} disabled={locked || checking} />
    </section>
  );
}
