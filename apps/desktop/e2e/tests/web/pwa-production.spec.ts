import { expect, test } from "@playwright/test"

import { buildProdWebAppURL } from "../../support/prod-web-env"
import {
  installAndControlProductionPwa,
  openProdWebApp,
  waitForServiceWorkerController,
} from "../../support/pwa-production"

const DEEP_ROUTE = "/timeline/articles/all/pending"

test.describe("production PWA service worker", () => {
  test.describe.configure({ timeout: 180_000 })

  test("registers, activates, and controls the page", async ({ page }) => {
    await openProdWebApp(page, DEEP_ROUTE)
    await waitForServiceWorkerController(page)

    const controllerScriptURL = await page.evaluate(
      () => navigator.serviceWorker.controller?.scriptURL ?? null,
    )
    expect(controllerScriptURL).toContain("/sw.js")
  })

  test("serves precached app shell assets while offline", async ({ page }) => {
    await installAndControlProductionPwa(page, DEEP_ROUTE)

    await page.context().setOffline(true)

    const shellResponse = await page.evaluate(async () => {
      const response = await fetch("/index.html")
      const text = await response.text()
      return {
        ok: response.ok,
        status: response.status,
        hasRoot: text.includes('id="root"'),
      }
    })

    expect(shellResponse.ok).toBe(true)
    expect(shellResponse.hasRoot).toBe(true)

    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true)
  })

  test("loads deep routes offline through navigation fallback", async ({ page }) => {
    await installAndControlProductionPwa(page, DEEP_ROUTE)

    await page.context().setOffline(true)
    const response = await page.goto(buildProdWebAppURL(DEEP_ROUTE), {
      waitUntil: "domcontentloaded",
    })

    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(new RegExp(`${DEEP_ROUTE.replace(/\//g, "\\/")}$`))
    await expect
      .poll(() => page.evaluate(() => document.documentElement.innerHTML.includes('id="root"')))
      .toBe(true)
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true)
  })

  test("serves sw.js without an unresolved precache manifest token", async ({ request }) => {
    const response = await request.get(buildProdWebAppURL("/sw.js"))
    expect(response.ok()).toBe(true)
    expect(response.headers()["cache-control"]).toContain("no-cache")

    const body = await response.text()
    expect(body).not.toContain("__WB_MANIFEST")
    expect(body).not.toContain("self.__FOLO_PRECACHE_MANIFEST__")
  })
})
