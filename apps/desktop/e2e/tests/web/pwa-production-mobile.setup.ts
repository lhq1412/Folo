import { mkdir } from "node:fs/promises"

import { test as setup } from "@playwright/test"
import { dirname } from "pathe"

import { waitForAuthenticated } from "../../support/app"
import { MOBILE_DRAWER_TIMELINE_ROUTE } from "../../support/mobile-drawer-fixture"
import { buildProdWebAppURL } from "../../support/prod-web-env"
import { installProdPwaMockSession } from "../../support/pwa-production"
import { MOBILE_PWA_PROD_AUTH_FILE } from "../../support/pwa-production-mobile-fixture"

setup("prepare authenticated production PWA mobile session", async ({ page }) => {
  await installProdPwaMockSession(page)
  await page.goto(buildProdWebAppURL(MOBILE_DRAWER_TIMELINE_ROUTE), {
    waitUntil: "domcontentloaded",
  })
  await waitForAuthenticated(page)
  await mkdir(dirname(MOBILE_PWA_PROD_AUTH_FILE), { recursive: true })
  await page.context().storageState({ path: MOBILE_PWA_PROD_AUTH_FILE })
})
