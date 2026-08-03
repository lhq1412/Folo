import type { env as EnvType } from "@follow/shared/env.desktop"
import type { PluginOption } from "vite"

import { MOBILE_MEDIA_QUERY } from "../../../../packages/internal/components/src/constants/viewport"

export function injectViewportBootstrap(html: string, mediaQuery = MOBILE_MEDIA_QUERY) {
  return html.replace(
    "<!-- FOLLOW VIEWPORT BOOTSTRAP INJECT -->",
    `const mobileViewportQuery = window.matchMedia(${JSON.stringify(mediaQuery)})
      const applyViewportDataset = () => {
        document.documentElement.dataset.viewport = mobileViewportQuery.matches ? "mobile" : "desktop"
      }
      applyViewportDataset()`,
  )
}

export function htmlInjectPlugin(env: typeof EnvType): PluginOption {
  return {
    name: "html-transform",
    enforce: "post",
    transformIndexHtml(html) {
      return injectViewportBootstrap(
        html.replace(
          "<!-- FOLLOW VITE BUILD INJECT -->",
          `<script id="env_injection" type="module">
      ${function injectEnv(env: any) {
        for (const key in env) {
          if (env[key] === undefined) continue
          globalThis["__followEnv"] ??= {}
          globalThis["__followEnv"][key] = env[key]
        }
      }.toString()}
      injectEnv(${JSON.stringify({
        VITE_API_URL: env.VITE_API_URL,
        VITE_WEB_URL: env.VITE_WEB_URL,
      })})
      </script>`,
        ),
      )
    },
  }
}
