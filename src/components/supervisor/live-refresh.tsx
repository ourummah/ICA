"use client";

import { Radio, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const TABLES = ["tasks", "exceptions", "step_records", "photos"] as const;
const FALLBACK_MS = 30_000;

/**
 * Keeps a server-rendered dashboard current: listens for Supabase Realtime changes on this site
 * and re-renders the page (debounced), with a 30 s refresh as a fallback. RLS decides which
 * changes this user receives.
 */
export function LiveRefresh({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [live, setLive] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    let channel = supabase.channel(`site-${siteId}`);
    for (const table of TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `site_id=eq.${siteId}` },
        refresh,
      );
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe((status) => setLive(status === "SUBSCRIBED"));
    });
    const fallback = setInterval(() => router.refresh(), FALLBACK_MS);
    return () => {
      clearInterval(fallback);
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [siteId, router]);

  return (
    <span
      className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      data-live={live ? "true" : "false"}
    >
      {live === false ? <WifiOff className="size-4" aria-hidden /> : <Radio className="size-4" aria-hidden />}
      {live === null ? "Connecting…" : live ? "Live" : "Reconnecting… (refreshing every 30 s)"}
    </span>
  );
}
