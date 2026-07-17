import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1"
      ? undefined
      : {
          command: "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000",
          url: "http://127.0.0.1:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
          env: {
            FRAMORY_STORAGE: "file",
            FRAMORY_DATA_FILE: ".framory/e2e-data.json",
            FRAMORY_ALLOW_TEST_RESET: "1",
            FRAMORY_OWNER_EMAIL: "owner@framory.test",
            FRAMORY_OWNER_USERNAME: "owner",
            FRAMORY_OWNER_PASSWORD: "OwnerPassword123!",
            FRAMORY_OWNER_DISPLAY_NAME: "Owner Framory",
            FRAMORY_SESSION_SECRET: "e2e-session-secret",
            DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/framory?schema=public"
          }
        },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
