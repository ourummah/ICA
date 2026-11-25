"use client";

import dynamic from "next/dynamic";

/**
 * The cleaner app reads device storage (signed-in cleaner, timers) from its first render, so it
 * is rendered in the browser only.
 */
export const CleanerAppLoader = dynamic(() => import("./cleaner-app").then((m) => m.CleanerApp), {
  ssr: false,
  loading: () => <p className="p-4 text-lg">Loading…</p>,
});
