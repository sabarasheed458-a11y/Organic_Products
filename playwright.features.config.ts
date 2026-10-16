import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/features",
  timeout: 60000,
  workers: 1,
  use: {
    screenshot: "only-on-failure",
    baseURL: "http://localhost:3200",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "node tests/fixtures/supabase-server.mjs",
      url: "http://127.0.0.1:4401/health",
      timeout: 60000,
      reuseExistingServer: false,
    },
    {
      command: "npm.cmd run start -- --port 3200",
      url: "http://localhost:3200",
      timeout: 60000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:4401",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_fixture_only_not_a_real_key",
      },
    },
  ],
  reporter: "list",
});
