"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import type { IcaDb } from "./db";
import { pendingCount } from "./outbox";
import { backoffMs, flushOutbox } from "./sync";

export interface SyncStatus {
  pending: number;
  syncing: boolean;
  online: boolean;
}

const INTERVAL_MS = 30_000;

/**
 * Background sync for the outbox: runs when the browser comes online, when the app regains focus,
 * every 30 s while online, and right after each local save. Backs off exponentially on failure.
 */
export function useSync(db: IcaDb, onSynced?: () => void) {
  const [status, setStatus] = useState<SyncStatus>({
    pending: 0,
    syncing: false,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
  });
  const running = useRef(false);
  const failures = useRef(0);
  const nextAllowed = useRef(0);
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const refreshCount = useCallback(async () => {
    const pending = await pendingCount(db);
    setStatus((s) => ({ ...s, pending }));
    return pending;
  }, [db]);

  const sync = useCallback(
    async (force = false) => {
      // Always refresh the count so the indicator is right even with no signal.
      const pending = await refreshCount();
      if (running.current || !navigator.onLine || pending === 0) return;
      if (!force && Date.now() < nextAllowed.current) return;
      running.current = true;
      setStatus((s) => ({ ...s, syncing: true }));
      try {
        // Refresh the device session first if it expired while offline.
        await createClient().auth.getSession();
        const result = await flushOutbox(db);
        failures.current = 0;
        nextAllowed.current = 0;
        if (result.synced > 0) onSyncedRef.current?.();
      } catch {
        failures.current += 1;
        nextAllowed.current = Date.now() + backoffMs(failures.current);
      } finally {
        running.current = false;
        setStatus((s) => ({ ...s, syncing: false }));
        await refreshCount();
      }
    },
    [db, refreshCount],
  );

  useEffect(() => {
    const kick = () => void sync(true);
    const onOnline = () => {
      setStatus((s) => ({ ...s, online: true }));
      kick();
    };
    const onOffline = () => setStatus((s) => ({ ...s, online: false }));
    const onVisible = () => document.visibilityState === "visible" && kick();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", kick);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void sync(), INTERVAL_MS);
    const first = setTimeout(kick, 0);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", kick);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [sync]);

  return { status, sync, refreshCount };
}
