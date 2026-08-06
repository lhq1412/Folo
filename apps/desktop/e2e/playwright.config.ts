import { defineConfig, devices } from "@playwright/test"

import { resolveDesktopE2EEnv } from "./support/env"
import { MOBILE_DRAWER_AUTH_FILE } from "./support/mobile-drawer-fixture"

const env = resolveDesktopE2EEnv()

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: env.webBaseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    serviceWorkers: "block",
  },
  webServer: {
    command: "pnpm run dev:web",
    cwd: env.desktopAppDir,
    env: {
      ...process.env,
      VITE_API_URL: process.env.FOLO_E2E_WEB_DEV_API_URL ?? env.apiURL,
      VITE_WEB_URL: process.env.FOLO_E2E_WEB_DEV_WEB_URL ?? env.webURL,
    },
    url: env.webDevServerURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "mobile-drawer-setup",
      testMatch: /tests\/web\/mobile-drawer-a11y\.setup\.ts/,
      use: {
        ...devices["Pixel 7"],
        channel: "chromium",
        ignoreHTTPSErrors: true,
        launchOptions: {
          args: ["--disable-web-security"],
        },
      },
    },
    {
      name: "web-mobile",
      testMatch: /tests\/web\/mobile-drawer-a11y\.spec\.ts/,
      dependencies: ["mobile-drawer-setup"],
      use: {
        storageState: MOBILE_DRAWER_AUTH_FILE,
        ...devices["Pixel 7"],
        channel: "chromium",
        ignoreHTTPSErrors: true,
        launchOptions: {
          args: ["--disable-web-security"],
        },
      },
    },
    {
      name: "web-mobile-layout",
      testMatch: /tests\/web\/mobile-layout\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        channel: "chromium",
        ignoreHTTPSErrors: true,
        launchOptions: {
          args: ["--disable-web-security"],
        },
      },
    },
    {
      name: "web-mobile-webkit",
      testMatch: /tests\/web\/mobile-layout\.spec\.ts/,
      use: {
        ...devices["iPhone 14"],
        browserName: "webkit",
        serviceWorkers: "block",
        ignoreHTTPSErrors: true,
      },
    },
    {
      name: "web",
      testMatch: /tests\/web\/.*\.spec\.ts/,
      testIgnore: [
        /tests\/web\/mobile-drawer-a11y\.spec\.ts/,
        /tests\/web\/mobile-layout\.spec\.ts/,
        /tests\/web\/pwa-update-coordination\.spec\.ts/,
      ],
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        ignoreHTTPSErrors: true,
        launchOptions: {
          args: ["--disable-web-security"],
        },
      },
    },
    {
      name: "web-pwa",
      testMatch: /tests\/web\/pwa-update-coordination\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        ignoreHTTPSErrors: true,
        serviceWorkers: "allow",
        launchOptions: {
          args: ["--disable-web-security"],
        },
      },
      webServer: {
        command: "pnpm run dev:web:pwa",
        cwd: env.desktopAppDir,
        env: {
          ...process.env,
          VITE_API_URL: process.env.FOLO_E2E_WEB_DEV_API_URL ?? env.apiURL,
          VITE_WEB_URL: process.env.FOLO_E2E_WEB_DEV_WEB_URL ?? env.webURL,
        },
        url: env.webDevServerURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
    },
    {
      name: "electron",
      testMatch: /tests\/electron\/.*\.spec\.ts/,
    },
  ],
})
