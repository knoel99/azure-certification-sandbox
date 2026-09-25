import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { defineConfig, devices } from "@playwright/test";

const bundledLibs = `${homedir()}/.local/playwright-libs/usr/lib/x86_64-linux-gnu`;
const libraryPath = [existsSync(bundledLibs) ? bundledLibs : "", process.env.LD_LIBRARY_PATH]
  .filter(Boolean)
  .join(":");

export default defineConfig({
  testDir: "./e2e",
  timeout: 180000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8765",
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      env: { ...process.env, LD_LIBRARY_PATH: libraryPath },
    },
  },
  webServer: {
    command: "python3 -m http.server 8765",
    url: "http://127.0.0.1:8765",
    reuseExistingServer: true,
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
