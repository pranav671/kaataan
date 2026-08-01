import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4190",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm start:server",
      url: "http://127.0.0.1:4191/health",
      timeout: 20_000,
      reuseExistingServer: false,
      env: { KAATAAN_SERVER_PORT: "4191", KAATAAN_SERVER_HOST: "127.0.0.1" },
    },
    {
      command: "pnpm --filter @kaataan/web exec vite --host 127.0.0.1 --port 4190",
      url: "http://127.0.0.1:4190",
      timeout: 20_000,
      reuseExistingServer: false,
      env: { VITE_GAME_SERVER_URL: "ws://127.0.0.1:4191/socket" },
    },
  ],
});
