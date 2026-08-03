import { test as setup } from "@playwright/test"

import { resolveDesktopE2EEnv } from "../../support/env"
import {
  ensureMobileDrawerTimelineReady,
  prepareMobileDrawerAuthenticatedPage,
  saveMobileDrawerAuthState,
} from "../../support/mobile-drawer-fixture"

const env = resolveDesktopE2EEnv()

setup("prepare authenticated mobile drawer session", async ({ page }) => {
  await prepareMobileDrawerAuthenticatedPage(page, env)
  await ensureMobileDrawerTimelineReady(page, env)
  await saveMobileDrawerAuthState(page)
})
