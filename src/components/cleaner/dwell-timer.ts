"use client";

import { useEffect, useState } from "react";

const key = (taskId: string, stepId: string) => `ica.timer.${taskId}.${stepId}`;

/** Start time survives app close and refresh because it is stored, not counted in memory. */
export function getOrStartTimer(taskId: string, stepId: string): string {
  try {
    const existing = localStorage.getItem(key(taskId, stepId));
    if (existing) return existing;
    const now = new Date().toISOString();
    localStorage.setItem(key(taskId, stepId), now);
    return now;
  } catch {
    return new Date().toISOString();
  }
}

export function clearTimer(taskId: string, stepId: string): void {
  try {
    localStorage.removeItem(key(taskId, stepId));
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

function alertEnd() {
  try {
    navigator.vibrate?.([400, 200, 400, 200, 400]);
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch {
    // No vibration or audio available.
  }
}

/** Seconds left on a countdown that started at `startedAt` and lasts `durationSeconds`. */
export function useCountdown(startedAt: string | null, durationSeconds: number): number {
  const compute = () =>
    startedAt ? Math.max(0, durationSeconds - (Date.now() - Date.parse(startedAt)) / 1000) : durationSeconds;
  const [left, setLeft] = useState(compute);
  useEffect(() => {
    if (!startedAt) return;
    let alerted = compute() === 0;
    const id = setInterval(() => {
      const l = compute();
      setLeft(l);
      if (l === 0 && !alerted) {
        alerted = true;
        alertEnd();
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, durationSeconds]);
  return left;
}

export function formatClock(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
