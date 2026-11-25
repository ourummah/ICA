import { spawnSync } from "node:child_process";

import { createSerwistRoute } from "@serwist/turbopack";

// Changes on every deploy so devices pick up the new app shell.
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ??
  String(Date.now());

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
  additionalPrecacheEntries: [{ url: "/manifest.webmanifest", revision }],
});
