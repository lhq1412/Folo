import { expect, test } from "@playwright/test"

import { openWebApp } from "../../support/app"
import { resolveDesktopE2EEnv } from "../../support/env"

const env = resolveDesktopE2EEnv()

const viewportCases = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
] as const

test.describe("mobile shell geometry", () => {
  for (const viewport of viewportCases) {
    test(`shell height matches viewport at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openWebApp(page, env)

      const shell = page.locator("#follow-root-container")
      await expect(shell).toBeVisible()
      await expect(shell).toHaveClass(/app-shell/)

      await expect
        .poll(() =>
          shell.evaluate((element) => {
            const rect = element.getBoundingClientRect()
            return Math.round(rect.height)
          }),
        )
        .toBe(viewport.height)

      await expect
        .poll(() =>
          shell.evaluate((element) => {
            const style = getComputedStyle(element)
            return {
              height: Math.round(Number.parseFloat(style.height)),
              maxHeight: Math.round(Number.parseFloat(style.maxHeight)),
            }
          }),
        )
        .toEqual({
          height: viewport.height,
          maxHeight: viewport.height,
        })
    })
  }

  test("main content owns the top safe-area boundary on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    const mainOwner = page.locator('main[data-safe-area-owner="main-top"]')
    await expect(mainOwner).toBeVisible()
    await expect(mainOwner).toHaveClass(/app-safe-top/)
  })

  test("drawer content keeps base gutter without duplicating top safe-area padding", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    const drawerContent = page.locator("#mobile-subscription-drawer .relative.flex.h-full")
    await expect(drawerContent).toBeVisible()

    const padding = await drawerContent.evaluate((element) => {
      const style = getComputedStyle(element)
      const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
      const paddingTop = Number.parseFloat(style.paddingTop)

      return {
        paddingTop,
        expected: rootFontSize * 0.625,
      }
    })

    expect(padding.paddingTop).toBeCloseTo(padding.expected, 1)
  })

  test("mobile drawer shell spans viewport top without extra safe-area offset", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    await page.evaluate(() => {
      document.documentElement.style.setProperty("--app-safe-top", "47px")
    })

    const drawerShell = page.locator('[data-safe-area-owner="mobile-drawer-bottom"]')
    await expect(drawerShell).toBeVisible()

    await expect
      .poll(() =>
        drawerShell.evaluate((element) => Math.round(element.getBoundingClientRect().top)),
      )
      .toBe(0)

    const shellGeometry = await drawerShell.evaluate((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        paddingTop: style.paddingTop,
        top: style.top,
        bottom: Math.round(rect.bottom),
        viewportHeight: window.innerHeight,
      }
    })

    expect(shellGeometry.paddingTop).toBe("0px")
    expect(shellGeometry.top).toBe("0px")
    expect(shellGeometry.bottom).toBe(shellGeometry.viewportHeight)
  })

  test("mobile drawer shell bottom respects injected safe-area bottom", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    await page.evaluate(() => {
      document.documentElement.style.setProperty("--app-safe-bottom", "34px")
    })

    const drawerShell = page.locator('[data-safe-area-owner="mobile-drawer-bottom"]')
    await expect(drawerShell).toBeVisible()

    await expect
      .poll(() => drawerShell.evaluate((element) => getComputedStyle(element).paddingBottom))
      .toBe("34px")

    const shellStyles = await drawerShell.evaluate((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        paddingBottom: style.paddingBottom,
        bottom: Math.round(rect.bottom),
        viewportHeight: window.innerHeight,
      }
    })

    expect(shellStyles.paddingBottom).toBe("34px")
    expect(shellStyles.bottom).toBe(shellStyles.viewportHeight)
  })

  test("mobile viewport bootstrap remains stable after resize", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.viewport))
      .toBe("mobile")

    await page.setViewportSize({ width: 1024, height: 768 })
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.viewport))
      .toBe("desktop")

    await page.setViewportSize({ width: 390, height: 844 })
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.viewport))
      .toBe("mobile")

    const shell = page.locator("#follow-root-container")
    await expect
      .poll(() => shell.evaluate((element) => Math.round(element.getBoundingClientRect().height)))
      .toBe(844)
  })

  test("sets display mode dataset on load", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.displayMode))
      .toBe("browser")
  })

  test("print mode removes viewport max-height constraint from shell", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    const shell = page.locator("#follow-root-container")
    await page.emulateMedia({ media: "print" })

    await expect
      .poll(() =>
        shell.evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            maxHeight: style.maxHeight,
            overflow: style.overflow,
          }
        }),
      )
      .toEqual({
        maxHeight: "none",
        overflow: "visible",
      })
  })
})

/**
 * WebKit/Chromium DOM/CSS ownership invariants only. These tests do not reproduce
 * iOS Home Screen standalone status-bar and safe-area behavior exactly.
 */
