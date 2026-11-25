import { defineConfig, devices } from "@playwright/test";

// Load .env.local for the seed in global setup (Next loads it for the server itself).
try {
  process.loadEnvFile(".env.local");
} catch {
  // No local env file: CI writes one, or the seed step is skipped.
}

const port = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run start -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { DEMO_FAST_TIMERS: "true" },
  },
});
