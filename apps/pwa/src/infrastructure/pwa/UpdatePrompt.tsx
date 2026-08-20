import { useRegisterSW } from "virtual:pwa-register/react"

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <aside
      aria-label="App update"
      className="fixed bottom-[calc(4.5rem+var(--safe-bottom))] left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-fill-tertiary bg-material-thick p-3 shadow-xl"
    >
      <p className="min-w-0 flex-1 text-sm">A new version is ready.</p>
      <button
        className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white"
        type="button"
        onClick={() => void updateServiceWorker(true)}
      >
        Update
      </button>
      <button
        aria-label="Dismiss update"
        className="min-h-11 min-w-11 rounded-xl text-text-secondary"
        type="button"
        onClick={() => setNeedRefresh(false)}
      >
        Later
      </button>
    </aside>
  )
}
