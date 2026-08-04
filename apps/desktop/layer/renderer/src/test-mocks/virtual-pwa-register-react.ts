import type { RegisterSWOptions } from "vite-plugin-pwa/types"

export function useRegisterSW(_options?: RegisterSWOptions) {
  return {
    needRefresh: [false, () => {}] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: async () => {},
  }
}
