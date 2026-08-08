import { fileURLToPath } from "node:url"

import { dirname, join } from "pathe"

export const MOBILE_PWA_PROD_AUTH_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../.auth/mobile-pwa-prod.json",
)
