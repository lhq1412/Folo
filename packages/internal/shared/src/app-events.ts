type AppEventListener = () => void | Promise<void>

const navigateEntryListeners = new Set<AppEventListener>()
const subscribeListeners = new Set<AppEventListener>()

export const appEvents = {
  onNavigateEntry(listener: AppEventListener) {
    navigateEntryListeners.add(listener)
    return () => {
      navigateEntryListeners.delete(listener)
    }
  },

  onSubscribe(listener: AppEventListener) {
    subscribeListeners.add(listener)
    return () => {
      subscribeListeners.delete(listener)
    }
  },

  emitNavigateEntry() {
    for (const listener of navigateEntryListeners) {
      void listener()
    }
  },

  emitSubscribe() {
    for (const listener of subscribeListeners) {
      void listener()
    }
  },
}
