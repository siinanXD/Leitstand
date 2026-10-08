import { defineConfig, devices } from "@playwright/test";

// Lokal/CI: startet `next start` auf Port 43124.
// Gegen eine Preview: PLAYWRIGHT_BASE_URL setzen (optional mit
// VERCEL_AUTOMATION_BYPASS_SECRET für geschützte Vercel-Previews).
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: externalBaseURL ?? "http://127.0.0.1:43124",
    trace: "on-first-retry",
    extraHTTPHeaders: bypassSecret
      ? {
          "x-vercel-protection-bypass": bypassSecret,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: "npx next start --hostname 127.0.0.1 --port 43124",
        url: "http://127.0.0.1:43124",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
