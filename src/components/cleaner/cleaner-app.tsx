"use client";

import { CircleCheck } from "lucide-react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { messagesFor, type Locale } from "@/lib/i18n";
import type { StepRecordPayload } from "@/lib/records/payload";

import { ConsentNotice } from "./consent";
import { loadCleanerData, loadCleaners, savePreferences, verifyPin } from "./data";
import { clearTimer } from "./dwell-timer";
import { CleanerHeader, type SyncState } from "./header";
import { LanguagePicker } from "./language-picker";
import { SignIn } from "./sign-in";
import { StepScreen, type StepResult } from "./step-screen";
import { submitStepRecord, uploadPhoto } from "./submit";
import { doneStepIds, TaskList } from "./task-list";
import type { Cleaner, CleanerData, DeviceInfo } from "./types";

const CLEANER_KEY = "ica.cleaner";

type Screen =
  | { name: "signin" }
  | { name: "language"; then: "consent" | "tasks" }
  | { name: "consent" }
  | { name: "tasks" }
  | { name: "task"; taskId: string }
  | { name: "complete" };

function readStoredCleaner(): Cleaner | null {
  try {
    const raw = localStorage.getItem(CLEANER_KEY);
    return raw ? (JSON.parse(raw) as Cleaner) : null;
  } catch {
    return null;
  }
}

function storeCleaner(c: Cleaner | null) {
  try {
    if (c) localStorage.setItem(CLEANER_KEY, JSON.stringify(c));
    else localStorage.removeItem(CLEANER_KEY);
  } catch {
    // Storage unavailable: the cleaner signs in again after a refresh.
  }
}

function CompleteScreen({ onBack }: { onBack: () => void }) {
  const t = useTranslations("complete");
  return (
    <section className="flex flex-col items-center gap-6 p-6 text-center">
      <CircleCheck className="size-24 text-status-green" aria-hidden />
      <h1 className="text-3xl font-bold text-primary">{t("title")}</h1>
      <p className="text-xl">{t("body")}</p>
      <Button size="cleaner" variant="accent" className="w-full" onClick={onBack}>
        {t("backToTasks")}
      </Button>
    </section>
  );
}

function App({
  device,
  fastTimers,
  locale,
  setLocale,
}: {
  device: DeviceInfo;
  fastTimers: boolean;
  locale: Locale;
  setLocale: (l: Locale) => void;
}) {
  const t = useTranslations("common");
  const [cleaners, setCleaners] = useState<Cleaner[] | null>(null);
  // Rendered on the client only (see cleaner-app-loader), so a signed-in cleaner survives a refresh.
  const [cleaner, setCleaner] = useState<Cleaner | null>(readStoredCleaner);
  const [data, setData] = useState<CleanerData | null>(null);
  const [screen, setScreen] = useState<Screen>(() =>
    readStoredCleaner() ? { name: "tasks" } : { name: "signin" },
  );
  const [sync, setSync] = useState<SyncState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await loadCleanerData(device.siteId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [device.siteId]);

  useEffect(() => {
    let live = true;
    loadCleaners()
      .then((c) => live && setCleaners(c))
      .catch(() => live && setLoadError(true));
    loadCleanerData(device.siteId)
      .then((d) => live && setData(d))
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, [device.siteId]);

  const signIn = (c: Cleaner) => {
    setCleaner(c);
    setLocale(c.language);
    storeCleaner(c);
    setScreen(c.hasConsented ? { name: "tasks" } : { name: "language", then: "consent" });
  };

  const signOut = () => {
    storeCleaner(null);
    setCleaner(null);
    setLocale("en");
    setScreen({ name: "signin" });
  };

  const pickLanguage = async (l: Locale) => {
    if (!cleaner) return;
    setLocale(l);
    const updated = { ...cleaner, language: l };
    setCleaner(updated);
    storeCleaner(updated);
    savePreferences(cleaner.profileId, l, false).catch(() => undefined);
    setScreen(
      screen.name === "language" && screen.then === "consent" ? { name: "consent" } : { name: "tasks" },
    );
  };

  const acceptConsent = async () => {
    if (!cleaner) return;
    const updated = { ...cleaner, hasConsented: true };
    setCleaner(updated);
    storeCleaner(updated);
    savePreferences(cleaner.profileId, null, true).catch(() => undefined);
    setScreen({ name: "tasks" });
  };

  const task = screen.name === "task" ? data?.tasks.find((x) => x.id === screen.taskId) : undefined;
  const done = task && data ? doneStepIds(task, data.records) : new Set<string>();
  const stepIndex = task ? task.steps.findIndex((s) => !done.has(s.id)) : -1;
  const step = task && stepIndex >= 0 ? task.steps[stepIndex] : undefined;

  const completeStep = async (r: StepResult) => {
    if (!task || !step || !cleaner || !data) return;
    setSaveError(null);
    setSync("saving");
    const payload: StepRecordPayload = {
      client_record_id: crypto.randomUUID(),
      task_id: task.id,
      ssop_step_id: step.id,
      profile_id: cleaner.profileId,
      result: r.result,
      skip_reason: r.skipReason,
      note_original: r.note,
      note_language: r.note ? cleaner.language : null,
      atp_value: r.atpValue,
      timer_started_at: r.timerStartedAt,
      timer_ended_at: r.timerEndedAt,
      device_started_at: r.startedAt,
      device_completed_at: new Date().toISOString(),
      supersedes_client_record_id: null,
    };
    try {
      await submitStepRecord(payload);
      if (r.photo) await uploadPhoto(r.photo, payload.client_record_id);
      clearTimer(task.id, step.id);
      const records = [
        ...data.records,
        {
          clientRecordId: payload.client_record_id,
          taskId: task.id,
          stepId: step.id,
          result: r.result,
          atpValue: r.atpValue,
        },
      ];
      setData({ ...data, records });
      setSync("saved");
      if (stepIndex === task.steps.length - 1) {
        setScreen({ name: "complete" });
        void refresh();
      }
    } catch (e) {
      setSync("failed");
      setSaveError(e instanceof Error ? e.message : "save failed");
    }
  };

  const headerName = cleaner && screen.name !== "signin" ? cleaner.displayName : null;
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-lg" lang={locale}>
      <CleanerHeader
        name={headerName}
        sync={sync}
        onLanguage={
          cleaner && screen.name !== "signin"
            ? () => setScreen({ name: "language", then: "tasks" })
            : undefined
        }
        onSignOut={cleaner && screen.name !== "signin" ? signOut : undefined}
      />
      <main className="mx-auto w-full max-w-xl flex-1">
        {loadError ? (
          <div className="flex flex-col gap-3 p-4">
            <p role="alert" className="text-lg font-semibold text-destructive">
              {t("loading")}
            </p>
            <Button size="cleaner" variant="outline" onClick={() => void refresh()}>
              {t("retry")}
            </Button>
          </div>
        ) : null}
        {screen.name === "signin" ? (
          cleaners ? (
            <SignIn cleaners={cleaners} verify={verifyPin} onSignedIn={signIn} />
          ) : (
            <p className="p-4">{t("loading")}</p>
          )
        ) : null}
        {screen.name === "language" ? <LanguagePicker value={locale} onPick={pickLanguage} /> : null}
        {screen.name === "consent" ? <ConsentNotice onAccept={acceptConsent} /> : null}
        {screen.name === "tasks" && cleaner ? (
          data ? (
            <TaskList
              tasks={data.tasks}
              records={data.records}
              profileId={cleaner.profileId}
              hasShift={!!data.shift}
              onOpen={(taskId) => setScreen({ name: "task", taskId })}
            />
          ) : (
            <p className="p-4">{t("loading")}</p>
          )
        ) : null}
        {screen.name === "task" && task ? (
          step ? (
            <StepScreen
              key={step.id}
              taskId={task.id}
              step={step}
              index={stepIndex}
              total={task.steps.length}
              equipmentName={task.equipmentName}
              fastTimers={fastTimers}
              saving={sync === "saving"}
              error={saveError}
              onBack={() => setScreen({ name: "tasks" })}
              onComplete={completeStep}
            />
          ) : (
            <CompleteScreen onBack={() => setScreen({ name: "tasks" })} />
          )
        ) : null}
        {screen.name === "complete" ? <CompleteScreen onBack={() => setScreen({ name: "tasks" })} /> : null}
      </main>
      <footer className="px-4 py-2 text-center text-xs text-muted-foreground">
        {device.siteName} · {device.label}
      </footer>
    </div>
  );
}

export function CleanerApp({ device, fastTimers }: { device: DeviceInfo; fastTimers: boolean }) {
  const [locale, setLocale] = useState<Locale>(() => readStoredCleaner()?.language ?? "en");
  const messages = useMemo(() => messagesFor(locale), [locale]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={device.timezone}>
      <App device={device} fastTimers={fastTimers} locale={locale} setLocale={setLocale} />
    </NextIntlClientProvider>
  );
}
