"use client";

import { Ban, Camera, ChevronLeft, FlaskConical, StickyNote, Timer, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { formatClock, getOrStartTimer, useCountdown } from "./dwell-timer";
import { Keypad } from "./keypad";
import { StepIcon } from "./step-icon";
import { capturePhoto, type CapturedPhoto } from "./submit";
import type { Step } from "./types";

export const SKIP_REASONS = ["equipment_broken", "no_chemical", "unsafe", "no_access", "other"] as const;

export interface StepResult {
  result: "done" | "skipped" | "failed";
  skipReason: string | null;
  note: string | null;
  atpValue: number | null;
  timerStartedAt: string | null;
  timerEndedAt: string | null;
  startedAt: string;
  photo: CapturedPhoto | null;
}

export function StepScreen({
  taskId,
  step,
  index,
  total,
  equipmentName,
  fastTimers,
  saving,
  error,
  onBack,
  onComplete,
}: {
  taskId: string;
  step: Step;
  index: number;
  total: number;
  equipmentName: string;
  fastTimers: boolean;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onComplete: (r: StepResult) => void;
}) {
  const t = useTranslations("step");
  const [startedAt] = useState(() => new Date().toISOString());
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [skipOpen, setSkipOpen] = useState(false);
  const [atp, setAtp] = useState("");
  const [atpFailed, setAtpFailed] = useState(false);
  const [confirmEarly, setConfirmEarly] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasTimer =
    !!step.dwellMinutes && (step.type === "dwell" || step.type === "foam" || step.type === "sanitise");
  const duration = (step.dwellMinutes ?? 0) * (fastTimers ? 1 : 60);
  // The screen is keyed by step, and the app renders on the client only, so storage is available here.
  const [timerStartedAt] = useState<string | null>(() =>
    hasTimer ? getOrStartTimer(taskId, step.id) : null,
  );
  const left = useCountdown(timerStartedAt, duration);
  const timerRunning = hasTimer && left > 0;

  const finish = (result: StepResult["result"], extra: Partial<StepResult> = {}) =>
    onComplete({
      result,
      skipReason: null,
      note: note.trim() || null,
      atpValue: null,
      timerStartedAt: hasTimer ? timerStartedAt : null,
      timerEndedAt: hasTimer ? new Date().toISOString() : null,
      startedAt,
      photo,
      ...extra,
    });

  const onDone = () => {
    if (timerRunning && !confirmEarly) {
      setConfirmEarly(true);
      return;
    }
    finish("done");
  };

  const submitAtp = () => {
    const value = Number(atp);
    if (!atp || Number.isNaN(value)) return;
    const failed = step.atpPassMax !== null && value > step.atpPassMax;
    if (failed && !atpFailed) {
      setAtpFailed(true);
      return;
    }
    finish(failed ? "failed" : "done", { atpValue: value });
  };

  const needsPhoto = step.photoRequired && !photo;

  if (skipOpen) {
    return (
      <section className="flex flex-col gap-4 p-4">
        <button
          type="button"
          onClick={() => setSkipOpen(false)}
          className="flex min-h-14 items-center gap-1 self-start text-lg font-medium text-accent"
        >
          <ChevronLeft className="size-6" aria-hidden /> {step.title}
        </button>
        <h1 className="text-2xl font-bold text-primary">{t("cantDoTitle")}</h1>
        <ul className="flex flex-col gap-3">
          {SKIP_REASONS.map((r) => (
            <li key={r}>
              <Button
                size="cleaner"
                variant="outline"
                className="w-full justify-start"
                disabled={saving}
                onClick={() => finish("skipped", { skipReason: r })}
              >
                {t(`reasons.${r}`)}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-14 min-w-14 items-center gap-1 text-lg font-medium text-accent"
        >
          <ChevronLeft className="size-6" aria-hidden />
          <span className="truncate">{equipmentName}</span>
        </button>
        <span className="shrink-0 whitespace-nowrap text-lg font-semibold">
          {t("progress", { current: index + 1, total })}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full bg-accent" style={{ width: `${(index / total) * 100}%` }} />
      </div>

      <div className="flex items-start gap-4">
        <StepIcon name={step.icon} className="size-20 shrink-0 text-accent" />
        <div>
          <h1 className="text-3xl font-bold text-primary">{step.title}</h1>
          {step.instructions ? <p className="mt-2 text-xl leading-relaxed">{step.instructions}</p> : null}
        </div>
      </div>

      {step.chemicalName ? (
        <div className="flex items-center gap-3 rounded-xl border-4 border-accent bg-accent/10 p-4">
          <FlaskConical className="size-10 shrink-0 text-accent" aria-hidden />
          <div className="text-xl">
            <p>
              <span className="text-base text-muted-foreground">{t("chemical")}: </span>
              <strong>{step.chemicalName}</strong>
            </p>
            {step.dilution ? (
              <p>
                <span className="text-base text-muted-foreground">{t("dilution")}: </span>
                <strong>{step.dilution}</strong>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasTimer ? (
        <div
          className={`flex flex-col items-center gap-1 rounded-xl p-4 ${timerRunning ? "bg-status-amber/15" : "bg-status-green/15"}`}
        >
          <Timer className="size-10" aria-hidden />
          <p className="font-mono text-6xl font-bold tabular-nums" role="timer" aria-live="off">
            {formatClock(left)}
          </p>
          <p className="text-lg font-semibold">{timerRunning ? t("timerRunning") : t("timerDone")}</p>
        </div>
      ) : null}

      {step.photoRequired || photo ? (
        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label={t("takePhoto")}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setPhoto(await capturePhoto(file));
              e.target.value = "";
            }}
          />
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.previewUrl} alt="" className="max-h-56 w-full rounded-xl object-cover" />
          ) : (
            <p className="text-lg font-semibold text-status-amber">{t("photoNeeded")}</p>
          )}
          <Button
            size="cleaner"
            variant={photo ? "outline" : "accent"}
            onClick={() => fileRef.current?.click()}
          >
            <Camera aria-hidden /> {photo ? t("retakePhoto") : t("takePhoto")}
          </Button>
        </div>
      ) : null}

      {step.atpRequired ? (
        <div className="flex flex-col gap-3">
          <p className="text-xl font-semibold">{t("atpEnter")}</p>
          {step.atpPassMax !== null ? (
            <p className="text-lg text-muted-foreground">{t("atpLimit", { max: step.atpPassMax })}</p>
          ) : null}
          <output
            className="block rounded-xl border-2 border-input p-3 text-center font-mono text-5xl"
            aria-label={t("atpEnter")}
          >
            {atp || "—"}
          </output>
          {atpFailed ? (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border-4 border-status-red bg-status-red/10 p-4"
            >
              <TriangleAlert className="size-10 shrink-0 text-status-red" aria-hidden />
              <div>
                <p className="text-2xl font-bold text-status-red">{t("atpFail")}</p>
                <p className="text-lg">{t("atpFailHelp")}</p>
              </div>
            </div>
          ) : (
            <Keypad value={atp} onChange={setAtp} maxLength={6} disabled={saving} />
          )}
        </div>
      ) : null}

      {noteOpen ? (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("notePlaceholder")}
          maxLength={2000}
          rows={3}
          className="w-full rounded-xl border-2 border-input bg-background p-3 text-xl"
          aria-label={t("addNote")}
          autoFocus
        />
      ) : (
        <Button size="cleaner" variant="ghost" className="self-start" onClick={() => setNoteOpen(true)}>
          <StickyNote aria-hidden /> {t("addNote")}
        </Button>
      )}

      {error ? (
        <p role="alert" className="text-lg font-semibold text-destructive">
          {t("saveFailed")}
        </p>
      ) : null}
      {confirmEarly ? (
        <p role="alert" className="text-lg font-semibold text-status-amber">
          {t("finishEarlyConfirm")}
        </p>
      ) : null}

      <div className="sticky bottom-0 flex flex-col gap-3 bg-background pt-2 pb-4">
        {step.atpRequired ? (
          <Button
            size="cleaner"
            variant={atpFailed ? "destructive" : "accent"}
            className="min-h-16 text-xl"
            disabled={!atp || saving || needsPhoto}
            onClick={submitAtp}
          >
            {atpFailed ? t("next") : t("atpSave")}
          </Button>
        ) : (
          <Button
            size="cleaner"
            variant={timerRunning ? "outline" : "accent"}
            className="min-h-16 text-xl"
            disabled={saving || needsPhoto}
            onClick={onDone}
          >
            {timerRunning ? t("finishEarly") : t("done")}
          </Button>
        )}
        <Button size="cleaner" variant="ghost" onClick={() => setSkipOpen(true)} disabled={saving}>
          <Ban aria-hidden /> {t("cantDo")}
        </Button>
      </div>
    </section>
  );
}
