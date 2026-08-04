import { expect, test } from "@playwright/test"

import { resolveDesktopE2EEnv } from "../../support/env"

const PWA_COORDINATOR_TIMEOUT_MS = 15_000

const waitForCoordinator = async (page: import("@playwright/test").Page) => {
  await page.waitForFunction(
    () => typeof window.__FOLO_PWA_COORDINATOR__ !== "undefined",
    undefined,
    { timeout: PWA_COORDINATOR_TIMEOUT_MS },
  )
}

test.describe("PWA update coordination", () => {
  test("shares IndexedDB completion tombstone across tabs and rejects stale replay", async ({
    page,
    context,
  }) => {
    const env = resolveDesktopE2EEnv()
    const updateId = "e2e-pwa-update-v3"
    const staleUpdateId = "e2e-pwa-update-v2"

    await page.addInitScript(() => {
      window.__FOLO_E2E_ENABLE_PWA_COORDINATOR__ = true
    })

    const pageB = await context.newPage()
    await pageB.addInitScript(() => {
      window.__FOLO_E2E_ENABLE_PWA_COORDINATOR__ = true
      window.BroadcastChannel = undefined
    })

    await page.goto(env.webBaseURL)
    await pageB.goto(env.webBaseURL)
    await waitForCoordinator(page)
    await waitForCoordinator(pageB)

    await page.evaluate(async () => {
      await window.__FOLO_PWA_COORDINATOR__?.reset()
    })
    await pageB.evaluate(async () => {
      await window.__FOLO_PWA_COORDINATOR__?.reset()
    })

    const completion = await page.evaluate(async (activeUpdateId) => {
      const coordinator = window.__FOLO_PWA_COORDINATOR__
      if (!coordinator) {
        throw new Error("PWA coordinator hook unavailable")
      }

      await coordinator.persistCanonical(activeUpdateId)
      return coordinator.markCompleted(activeUpdateId)
    }, updateId)

    await pageB.evaluate(async () => {
      await window.__FOLO_PWA_COORDINATOR__?.hydrate()
    })

    await pageB.waitForFunction(
      (expectedUpdateId) => {
        const snapshot = window.__FOLO_PWA_COORDINATOR__?.getSnapshot()
        return snapshot?.completed?.updateId === expectedUpdateId
      },
      updateId,
      { timeout: PWA_COORDINATOR_TIMEOUT_MS },
    )

    const firstConsume = await pageB.evaluate(async (record) => {
      return window.__FOLO_PWA_COORDINATOR__?.consumeCompletion(record)
    }, completion)
    expect(firstConsume).toBe("accepted")

    const secondConsume = await pageB.evaluate(async (record) => {
      return window.__FOLO_PWA_COORDINATOR__?.consumeCompletion(record)
    }, completion)
    expect(secondConsume).toBe("accepted")

    const staleConsume = await pageB.evaluate(
      async ({ record, staleId }) => {
        return window.__FOLO_PWA_COORDINATOR__?.consumeCompletion({
          updateId: staleId,
          nonce: "stale-nonce",
          completedAt: record.completedAt,
        })
      },
      { record: completion, staleId: staleUpdateId },
    )
    expect(staleConsume).toBe("stale")

    await pageB.close()
  })
})
