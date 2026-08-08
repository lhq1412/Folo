import { readFile, writeFile } from "node:fs/promises"

import { expect, test } from "@playwright/test"

import { resolveDesktopE2EEnv } from "../../support/env"
import { resolveProdWebServiceWorkerPath } from "../../support/prod-web-env"
import {
  bumpProductionServiceWorker,
  installAndControlProductionPwa,
  triggerServiceWorkerUpdateCheck,
  waitForServiceWorkerController,
  waitForWaitingServiceWorker,
} from "../../support/pwa-production"

const DEEP_ROUTE = "/timeline/articles/all/pending"
const DEFERRED_UPDATE_COPY = "A new version is ready. Update when it works for you."

test.describe("production PWA update flow", () => {
  test.describe.configure({ timeout: 240_000, mode: "serial" })

  let originalServiceWorkerContent = ""

  test.beforeAll(async () => {
    const env = resolveDesktopE2EEnv()
    const swPath = resolveProdWebServiceWorkerPath(env.desktopAppDir)
    originalServiceWorkerContent = await readFile(swPath, "utf8")
  })

  test.afterEach(async () => {
    const env = resolveDesktopE2EEnv()
    const swPath = resolveProdWebServiceWorkerPath(env.desktopAppDir)
    await writeFile(swPath, originalServiceWorkerContent, "utf8")
  })

  test("defers an available update without reloading the page", async ({ page }) => {
    const env = resolveDesktopE2EEnv()
    const swPath = resolveProdWebServiceWorkerPath(env.desktopAppDir)

    await installAndControlProductionPwa(page, DEEP_ROUTE)
    const initialController = await page.evaluate(
      () => navigator.serviceWorker.controller?.scriptURL ?? null,
    )

    await bumpProductionServiceWorker(swPath, `defer-${Date.now()}`)
    await triggerServiceWorkerUpdateCheck(page)
    await waitForWaitingServiceWorker(page)

    await expect(page.getByRole("button", { name: "Update now" })).toBeVisible({
      timeout: 30_000,
    })

    await page.getByRole("button", { name: "Later" }).click()
    await expect(page.getByText(DEFERRED_UPDATE_COPY)).toBeVisible()
    await expect(page.getByRole("button", { name: "Later" })).toHaveCount(0)

    await page.waitForTimeout(1_500)

    const currentController = await page.evaluate(
      () => navigator.serviceWorker.controller?.scriptURL ?? null,
    )
    expect(currentController).toBe(initialController)
  })

  test("activates a waiting worker when the user chooses update now", async ({ page }) => {
    const env = resolveDesktopE2EEnv()
    const swPath = resolveProdWebServiceWorkerPath(env.desktopAppDir)

    await installAndControlProductionPwa(page, DEEP_ROUTE)

    await bumpProductionServiceWorker(swPath, `apply-${Date.now()}`)
    await triggerServiceWorkerUpdateCheck(page)
    await waitForWaitingServiceWorker(page)

    await expect(page.getByRole("button", { name: "Update now" })).toBeVisible({
      timeout: 30_000,
    })

    await page.getByRole("button", { name: "Update now" }).click()
    await page.waitForLoadState("domcontentloaded", { timeout: 60_000 })
    await waitForServiceWorkerController(page)
  })

  test("does not force reload loops when two tabs defer the same update", async ({
    page,
    context,
  }) => {
    const env = resolveDesktopE2EEnv()
    const swPath = resolveProdWebServiceWorkerPath(env.desktopAppDir)

    await installAndControlProductionPwa(page, DEEP_ROUTE)

    const pageB = await context.newPage()
    await installAndControlProductionPwa(pageB, DEEP_ROUTE)

    await bumpProductionServiceWorker(swPath, `multi-tab-${Date.now()}`)
    await triggerServiceWorkerUpdateCheck(page)
    await triggerServiceWorkerUpdateCheck(pageB)
    await waitForWaitingServiceWorker(page)
    await waitForWaitingServiceWorker(pageB)

    await expect(page.getByRole("button", { name: "Update now" })).toBeVisible({
      timeout: 30_000,
    })
    await expect(pageB.getByRole("button", { name: "Update now" })).toBeVisible({
      timeout: 30_000,
    })

    await page.getByRole("button", { name: "Later" }).click()
    await expect(page.getByText(DEFERRED_UPDATE_COPY)).toBeVisible()

    await expect(pageB.getByText(DEFERRED_UPDATE_COPY)).toBeVisible({ timeout: 30_000 })
    await expect(pageB.getByRole("button", { name: "Later" })).toHaveCount(0)

    await pageB.close()
  })
})
