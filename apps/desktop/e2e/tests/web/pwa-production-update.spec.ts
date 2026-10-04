import { readFile, writeFile } from "node:fs/promises"

import { expect, test } from "@playwright/test"

import { resolveDesktopE2EEnv } from "../../support/env"
import { resolveProdWebServiceWorkerPath } from "../../support/prod-web-env"
import {
  bumpProductionServiceWorker,
  installAndControlProductionPwa,
  triggerServiceWorkerUpdateCheck,
  waitForRenderedProdAppShell,
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
    let navigationCount = 0
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigationCount++
    })

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
    expect(navigationCount).toBe(0)
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

    const controllerChanged = page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
            once: true,
          })
        }),
    )
    await Promise.all([controllerChanged, page.getByRole("button", { name: "Update now" }).click()])
    await waitForServiceWorkerController(page)
    await expect
      .poll(() =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting),
      )
      .toBeNull()
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
    let navigationCountA = 0
    let navigationCountB = 0
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigationCountA++
    })
    pageB.on("framenavigated", (frame) => {
      if (frame === pageB.mainFrame()) navigationCountB++
    })

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

    await page.waitForTimeout(1_500)
    expect([navigationCountA, navigationCountB]).toEqual([0, 0])

    await pageB.close()
  })

  test("preserves another tab's search draft when the new worker takes control", async ({
    page,
    context,
  }) => {
    const env = resolveDesktopE2EEnv()
    const swPath = resolveProdWebServiceWorkerPath(env.desktopAppDir)
    await installAndControlProductionPwa(page, DEEP_ROUTE)
    // Reopen the installed app so Workbox registers with an existing controller.
    await page.reload({ waitUntil: "domcontentloaded" })
    await waitForRenderedProdAppShell(page)
    await waitForServiceWorkerController(page)
    const pageB = await context.newPage()

    try {
      await installAndControlProductionPwa(pageB, DEEP_ROUTE)
      await pageB.keyboard.press("Control+k")
      const draftInput = pageB.getByTestId("local-search-input")
      await expect(draftInput).toBeVisible()
      await draftInput.fill("unfinished search before updating")
      let navigationCountA = 0
      let navigationCountB = 0
      let confirmationCountB = 0
      let acceptReloadB = false
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) navigationCountA++
      })
      pageB.on("framenavigated", (frame) => {
        if (frame === pageB.mainFrame()) navigationCountB++
      })
      pageB.on("dialog", (dialog) => {
        confirmationCountB++
        void (acceptReloadB ? dialog.accept() : dialog.dismiss())
      })

      await bumpProductionServiceWorker(swPath, `draft-preservation-${Date.now()}`)
      await triggerServiceWorkerUpdateCheck(page)
      await triggerServiceWorkerUpdateCheck(pageB)
      await waitForWaitingServiceWorker(page)
      await waitForWaitingServiceWorker(pageB)
      await expect(page.getByRole("button", { name: "Update now" })).toBeVisible()
      await expect(
        pageB.getByRole("button", { name: "Update now", includeHidden: true }),
      ).toBeVisible()

      const controllerChangedB = pageB.evaluate(
        () =>
          new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
              once: true,
            })
          }),
      )
      await Promise.all([
        controllerChangedB,
        page.getByRole("button", { name: "Update now" }).click(),
      ])
      await expect.poll(() => navigationCountA).toBe(1)
      await expect(
        pageB.getByRole("button", { name: "Reload", exact: true, includeHidden: true }),
      ).toBeVisible()
      await pageB.waitForTimeout(1_500)
      expect(navigationCountB).toBe(0)
      expect(confirmationCountB).toBe(0)
      await expect(draftInput).toHaveValue("unfinished search before updating")

      const reloadButton = pageB.getByRole("button", {
        name: "Reload",
        exact: true,
        includeHidden: true,
      })
      // Keep the search modal open so its unsaved query remains in the DOM.
      await reloadButton.evaluate((button) => (button as HTMLButtonElement).click())
      await expect.poll(() => confirmationCountB).toBe(1)
      expect(navigationCountB).toBe(0)
      await expect(draftInput).toHaveValue("unfinished search before updating")

      acceptReloadB = true
      await reloadButton.evaluate((button) => (button as HTMLButtonElement).click())
      await expect.poll(() => confirmationCountB).toBe(2)
      await expect.poll(() => navigationCountB).toBe(1)
      await waitForServiceWorkerController(pageB)
    } finally {
      await pageB.close()
    }
  })
})
