import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CleanerAppLoader } from "@/components/cleaner/cleaner-app-loader";
import { getDevice } from "@/lib/device/server";

async function Cleaner() {
  const ctx = await getDevice();
  if (!ctx) redirect("/app/device");
  return <CleanerAppLoader device={ctx.device} fastTimers={process.env.DEMO_FAST_TIMERS === "true"} />;
}

export default function CleanerPage() {
  return (
    <Suspense fallback={<p className="p-4 text-lg">Loading…</p>}>
      <Cleaner />
    </Suspense>
  );
}
