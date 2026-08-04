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
      const snapshot = coordinator.getSnapshot()
      const outcome = await coordinator.complete(activeUpdateId, snapshot.generation)
      if (outcome.result !== "accepted" || !outcome.record) {
        throw new Error(`Expected accepted completion, received ${outcome.result}`)
      }

      return outcome.record
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

  test("rejects stale origin completion after a newer batch completes in another tab", async ({
    page,
    context,
  }) => {
    const env = resolveDesktopE2EEnv()
    const v2UpdateId = "e2e-pwa-origin-v2"
    const v3UpdateId = "e2e-pwa-origin-v3"

    await page.addInitScript(() => {
      window.__FOLO_E2E_ENABLE_PWA_COORDINATOR__ = true
    })

    const pageB = await context.newPage()
    await pageB.addInitScript(() => {
      window.__FOLO_E2E_ENABLE_PWA_COORDINATOR__ = true
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

    const v2Generation = await page.evaluate(async (updateId) => {
      const coordinator = window.__FOLO_PWA_COORDINATOR__
      if (!coordinator) {
        throw new Error("PWA coordinator hook unavailable")
      }

      await coordinator.persistCanonical(updateId)
      return coordinator.getSnapshot().generation
    }, v2UpdateId)

    const v3Completion = await pageB.evaluate(async (updateId) => {
      const coordinator = window.__FOLO_PWA_COORDINATOR__
      if (!coordinator) {
        throw new Error("PWA coordinator hook unavailable")
      }

      await coordinator.persistCanonical(updateId)
      const snapshot = coordinator.getSnapshot()
      const outcome = await coordinator.complete(updateId, snapshot.generation)
      if (outcome.result !== "accepted" || !outcome.record) {
        throw new Error(`Expected accepted completion, received ${outcome.result}`)
      }

      return outcome.record
    }, v3UpdateId)

    const staleOrigin = await page.evaluate(
      async ({ updateId, expectedGeneration }) => {
        const coordinator = window.__FOLO_PWA_COORDINATOR__
        if (!coordinator) {
          throw new Error("PWA coordinator hook unavailable")
        }

        return coordinator.complete(updateId, expectedGeneration)
      },
      { updateId: v2UpdateId, expectedGeneration: v2Generation },
    )
    expect(staleOrigin.result).toBe("stale")

    const tabASnapshot = await page.evaluate(async () => {
      await window.__FOLO_PWA_COORDINATOR__?.refresh()
      return window.__FOLO_PWA_COORDINATOR__?.getSnapshot()
    })
    const tabBSnapshot = await pageB.evaluate(async () => {
      await window.__FOLO_PWA_COORDINATOR__?.refresh()
      return window.__FOLO_PWA_COORDINATOR__?.getSnapshot()
    })

    expect(tabASnapshot?.completed).toMatchObject({
      updateId: v3UpdateId,
      nonce: v3Completion.nonce,
      generation: v3Completion.generation,
      completedAt: v3Completion.completedAt,
    })
    expect(tabBSnapshot?.completed).toMatchObject({
      updateId: v3UpdateId,
      nonce: v3Completion.nonce,
      generation: v3Completion.generation,
      completedAt: v3Completion.completedAt,
    })
    expect(tabASnapshot?.activeUpdateId).toBeNull()
    expect(tabBSnapshot?.activeUpdateId).toBeNull()

    await pageB.close()
  })
})
