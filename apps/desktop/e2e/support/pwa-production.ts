import { appendFile } from "node:fs/promises"

import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"

import { hasRenderedAppShell, injectRecaptchaToken } from "./app"
import { resolveDesktopE2EEnv } from "./env"
import {
  installMobileDrawerMockAuth,
  installMobileDrawerTestInitScripts,
} from "./mobile-drawer-fixture"
import { buildProdWebAppURL } from "./prod-web-env"

const SERVICE_WORKER_TIMEOUT_MS = 60_000

export const waitForServiceWorkerRegistration = async (page: Page) => {
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return Boolean(registration?.installing || registration?.waiting || registration?.active)
    },
    undefined,
    { timeout: SERVICE_WORKER_TIMEOUT_MS },
  )
}

export const waitForServiceWorkerActivated = async (page: Page) => {
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return registration?.active?.state === "activated"
    },
    undefined,
    { timeout: SERVICE_WORKER_TIMEOUT_MS },
  )
}

export const waitForServiceWorkerController = async (page: Page) => {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: SERVICE_WORKER_TIMEOUT_MS,
  })
}

export const waitForRenderedProdAppShell = async (page: Page) => {
  await expect
    .poll(() => hasRenderedAppShell(page), { timeout: SERVICE_WORKER_TIMEOUT_MS })
    .toBe(true)
}

export const installProdPwaMockSession = async (page: Page) => {
  const env = resolveDesktopE2EEnv()
  await installMobileDrawerTestInitScripts(page)
  await installMobileDrawerMockAuth(page, env.apiURL)
  await injectRecaptchaToken(page, env)
}

export const openProdWebApp = async (
  page: Page,
  route = "/timeline/articles/all/pending",
  options?: { mockSession?: boolean },
) => {
  if (options?.mockSession !== false) {
    await installProdPwaMockSession(page)
  }

  await page.goto(buildProdWebAppURL(route), { waitUntil: "domcontentloaded" })
  await waitForRenderedProdAppShell(page)
}

export const installAndControlProductionPwa = async (
  page: Page,
  route = "/timeline/articles/all/pending",
) => {
  await openProdWebApp(page, route)
  await waitForServiceWorkerRegistration(page)
  await waitForServiceWorkerActivated(page)
  await waitForServiceWorkerController(page)
}

export const bumpProductionServiceWorker = async (swPath: string, bumpId: string) => {
  await appendFile(swPath, `\n/* folo-e2e-sw-bump:${bumpId} */\n`, "utf8")
}

export const triggerServiceWorkerUpdateCheck = async (page: Page) => {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) {
      throw new Error("Service worker registration is unavailable")
    }

    await registration.update()
  })
}

export const waitForWaitingServiceWorker = async (page: Page) => {
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return registration?.waiting?.state === "installed"
    },
    undefined,
    { timeout: SERVICE_WORKER_TIMEOUT_MS },
  )
}

export const readActiveServiceWorkerScriptURL = async (page: Page) => {
  return page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)
}
