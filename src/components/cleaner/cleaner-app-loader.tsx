"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

/**
 * The cleaner app reads device storage (signed-in cleaner, timers, outbox) from its first render,
 * so it is rendered in the browser only. The service worker keeps its app shell available offline;
 * it is scoped to the cleaner app so staff pages are never served from cache.
 */
const CleanerApp = dynamic(() => import("./cleaner-app").then((m) => m.CleanerApp), {
  ssr: false,
  loading: () => <p className="p-4 text-lg">Loading…</p>,
});

export function CleanerAppLoader(props: ComponentProps<typeof CleanerApp>) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV !== "production"}
      reloadOnOnline={false}
      options={{ scope: "/app/cleaner" }}
    >
      <CleanerApp {...props} />
    </SerwistProvider>
  );
}
