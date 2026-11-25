"use client";

import { CircleCheck } from "lucide-react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { messagesFor, type Locale } from "@/lib/i18n";
import type { StepRecordPayload } from "@/lib/records/payload";
import { getDb, type LocalRecord } from "@/offline/db";
import { saveStepLocally } from "@/offline/outbox";
import { useSync } from "@/offline/use-sync";

import { ConsentNotice } from "./consent";
import { cachedCleanerState, loadCleanerData, loadCleaners, savePreferences, verifyPin } from "./data";
import { clearTimer } from "./dwell-timer";
import { CleanerHeader } from "./header";
import { LanguagePicker } from "./language-picker";
import { SignIn } from "./sign-in";
import { StepScreen, type StepResult } from "./step-screen";
import { doneStepIds, TaskList } from "./task-list";
import type { Cleaner, CleanerData, DeviceInfo, RecordSummary } from "./types";

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
  const [localRecords, setLocalRecords] = useState<LocalRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const db = getDb();

  const refresh = useCallback(async () => {
    try {
      setData((await loadCleanerData(device.siteId)).data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [device.siteId]);
  const { status: syncStatus, sync } = useSync(db, refresh);

  useEffect(() => {
    let live = true;
    // Show what the device has straight away, then refresh from the server if there is signal.
    cachedCleanerState()
      .then((c) => {
        if (!live) return;
        if (c.cleaners) setCleaners((cur) => cur ?? c.cleaners);
        if (c.data) setData((cur) => cur ?? c.data);
      })
      .catch(() => undefined);
    loadCleaners()
      .then((c) => live && setCleaners(c))
      .catch(() => live && setLoadError(true));
    loadCleanerData(device.siteId)
      .then((d) => live && setData(d.data))
      .catch(() => live && setLoadError(true));
    db.records
      .toArray()
      .then((r) => live && setLocalRecords(r))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [device.siteId, db]);

  // Pick up re-cleans and new assignments while the cleaner is looking at the list.
  useEffect(() => {
    if (screen.name !== "tasks") return;
    const id = setInterval(() => {
      if (navigator.onLine) void refresh();
    }, 15_000);
    return () => clearInterval(id);
  }, [screen.name, refresh]);

  const backToTasks = () => {
    setScreen({ name: "tasks" });
    if (navigator.onLine) void refresh();
  };

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

  const updateCleaner = (updated: Cleaner) => {
    setCleaner(updated);
    storeCleaner(updated);
    setCleaners(
      (list) => list?.map((c) => (c.profileId === updated.profileId ? { ...c, ...updated } : c)) ?? list,
    );
  };

  const pickLanguage = async (l: Locale) => {
    if (!cleaner) return;
    setLocale(l);
    updateCleaner({ ...cleaner, language: l });
    savePreferences(cleaner.profileId, l, false).catch(() => undefined);
    setScreen(
      screen.name === "language" && screen.then === "consent" ? { name: "consent" } : { name: "tasks" },
    );
  };

  const acceptConsent = async () => {
    if (!cleaner) return;
    updateCleaner({ ...cleaner, hasConsented: true });
    savePreferences(cleaner.profileId, null, true).catch(() => undefined);
    setScreen({ name: "tasks" });
  };

  // What the server has, plus everything saved on this device (synced or still waiting).
  const records: RecordSummary[] = (() => {
    const byId = new Map<string, RecordSummary>((data?.records ?? []).map((r) => [r.clientRecordId, r]));
    for (const r of localRecords) {
      if (r.status === "rejected") continue;
      byId.set(r.clientRecordId, {
        clientRecordId: r.clientRecordId,
        taskId: r.taskId,
        stepId: r.stepId,
        result: r.payload.result,
        atpValue: r.payload.atp_value,
      });
    }
    return [...byId.values()];
  })();

  const task = screen.name === "task" ? data?.tasks.find((x) => x.id === screen.taskId) : undefined;
  const done = task ? doneStepIds(task, records) : new Set<string>();
  const stepIndex = task ? task.steps.findIndex((s) => !done.has(s.id)) : -1;
  const step = task && stepIndex >= 0 ? task.steps[stepIndex] : undefined;

  const completeStep = async (r: StepResult) => {
    if (!task || !step || !cleaner) return;
    setSaveError(null);
    setSaving(true);
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
      photo_sha256: r.photo?.sha256 ?? null,
    };
    try {
      // Device first, network later (SPEC 7): the step is safe once this resolves.
      const saved = await saveStepLocally(db, payload, r.photo);
      setLocalRecords((prev) => [...prev, saved]);
      clearTimer(task.id, step.id);
      if (stepIndex === task.steps.length - 1) setScreen({ name: "complete" });
      void sync(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  const headerName = cleaner && screen.name !== "signin" ? cleaner.displayName : null;
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-lg" lang={locale}>
      <CleanerHeader
        name={headerName}
        sync={syncStatus}
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
              records={records}
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
              saving={saving}
              error={saveError}
              onBack={backToTasks}
              onComplete={completeStep}
            />
          ) : (
            <CompleteScreen onBack={backToTasks} />
          )
        ) : null}
        {screen.name === "complete" ? <CompleteScreen onBack={backToTasks} /> : null}
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
