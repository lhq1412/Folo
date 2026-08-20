import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

import { liteRuntimeCaching } from "./src/infrastructure/pwa/runtime-caching"

export default defineConfig({
  build: {
    manifest: true,
  },
  server: {
    proxy: {
      "/api": {
        changeOrigin: true,
        cookieDomainRewrite: "",
        rewrite: (path) => path.replace(/^\/api/, ""),
        target: "https://api.folo.is",
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: "generateSW",
      registerType: "prompt",
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,html,css,webmanifest,svg,png}"],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/better-auth\//],
        runtimeCaching: liteRuntimeCaching,
      },
      manifest: {
        id: "/",
        name: "Folo",
        short_name: "Folo",
        description: "Follow everything in one place.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        icons: [
          {
            src: "icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
        ],
      },
    }),
  ],
})
