import { defineConfig, devices } from "@playwright/test"

import { resolveDesktopE2EEnv } from "./support/env"
import { MOBILE_DRAWER_AUTH_FILE } from "./support/mobile-drawer-fixture"
import { resolveProdWebServerURL } from "./support/prod-web-env"
import { MOBILE_PWA_PROD_AUTH_FILE } from "./support/pwa-production-mobile-fixture"

const env = resolveDesktopE2EEnv()
const prodWebServerURL = resolveProdWebServerURL()
const useProdWebServer = process.env.FOLO_E2E_USE_PROD_WEB_SERVER === "1"

const prodPwaUse = {
  baseURL: prodWebServerURL,
  channel: "chromium" as const,
  ignoreHTTPSErrors: true,
  serviceWorkers: "allow" as const,
  launchOptions: {
    args: ["--disable-web-security"],
  },
}

const prodWebServer = {
  command: "pnpm run e2e:serve-prod-web",
  cwd: env.desktopAppDir,
  timeout: 180_000,
  url: prodWebServerURL,
  reuseExistingServer: !process.env.CI,
}

const devWebServer = {
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
}

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
    baseURL: useProdWebServer ? prodWebServerURL : env.webBaseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    serviceWorkers: "block",
  },
  webServer: useProdWebServer ? prodWebServer : devWebServer,
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
      name: "web-mobile-layout-webkit",
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
        /tests\/web\/pwa-production.*\.spec\.ts/,
        /tests\/web\/pwa-production.*\.setup\.ts/,
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
      name: "pwa-prod-mobile-setup",
      testMatch: /tests\/web\/pwa-production-mobile\.setup\.ts/,
      use: {
        ...devices["Pixel 7"],
        ...prodPwaUse,
      },
    },
    {
      name: "web-pwa-prod-mobile",
      testMatch: /tests\/web\/pwa-production-mobile\.spec\.ts/,
      dependencies: ["pwa-prod-mobile-setup"],
      use: {
        storageState: MOBILE_PWA_PROD_AUTH_FILE,
        ...devices["Pixel 7"],
        ...prodPwaUse,
      },
    },
    {
      name: "web-pwa-prod",
      testMatch: /tests\/web\/pwa-production(?:-update)?\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        ...prodPwaUse,
      },
    },
    {
      name: "electron",
      testMatch: /tests\/electron\/.*\.spec\.ts/,
    },
  ],
})
