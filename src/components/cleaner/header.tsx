"use client";

import { CircleCheck, CloudOff, Languages, LogOut, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import type { SyncStatus } from "@/offline/use-sync";

/** Shown on every cleaner screen: who is signed in and whether their work is saved (SPEC 10). */
export function CleanerHeader({
  name,
  sync,
  onLanguage,
  onSignOut,
}: {
  name: string | null;
  sync: SyncStatus;
  onLanguage?: () => void;
  onSignOut?: () => void;
}) {
  const t = useTranslations();
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-foreground">
      <div className="min-w-0">
        {name ? <p className="truncate text-lg font-semibold">{name}</p> : null}
        <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-base">
          {sync.syncing ? (
            <>
              <RefreshCw className="size-5 animate-spin" aria-hidden /> {t("sync.syncing")}
            </>
          ) : sync.pending === 0 ? (
            <>
              <CircleCheck className="size-5 text-green-300" aria-hidden /> {t("sync.allSaved")}
            </>
          ) : (
            <>
              <CloudOff className="size-5 shrink-0 text-amber-300" aria-hidden />{" "}
              {t("sync.waiting", { count: sync.pending })}
            </>
          )}
        </p>
      </div>
      <div className="flex gap-2">
        {onLanguage ? (
          <button
            type="button"
            onClick={onLanguage}
            className="flex min-h-14 min-w-14 flex-col items-center justify-center rounded-lg px-2 text-xs hover:bg-white/10"
          >
            <Languages className="size-6" aria-hidden />
            {t("common.language")}
          </button>
        ) : null}
        {onSignOut ? (
          <button
            type="button"
            onClick={onSignOut}
            className="flex min-h-14 min-w-14 flex-col items-center justify-center rounded-lg px-2 text-xs hover:bg-white/10"
          >
            <LogOut className="size-6" aria-hidden />
            {t("common.signOut")}
          </button>
        ) : null}
      </div>
    </header>
  );
}
