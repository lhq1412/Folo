import type { PropsWithChildren } from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

import {
  hasPwaInstallEngagement,
  isPwaInstallCooldownActive,
  markPwaInstallDismissed,
  markPwaInstalled,
  markPwaPromptShown,
  PWA_INSTALL_ENGAGEMENT_DELAY_MS,
  readPwaInstallRecord,
  recordPwaVisit,
} from "~/lib/pwa/install-state"
import {
  isChromiumInstallContext,
  isIosSafariInstallContext,
  isStandaloneDisplayMode,
} from "~/lib/pwa/platform"

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export type PwaInstallPromptVariant = "chromium" | "ios" | null

type PwaInstallContextValue = {
  promptVariant: PwaInstallPromptVariant
  canPrompt: boolean
  dismissPrompt: () => void
  install: () => Promise<void>
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null)

export function usePwaInstall(): PwaInstallContextValue {
  const context = useContext(PwaInstallContext)
  if (!context) {
    throw new Error("usePwaInstall must be used within PwaInstallProvider")
  }

  return context
}

export function PwaInstallProvider({ children }: PropsWithChildren) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => isStandaloneDisplayMode())
  const [engagementReady, setEngagementReady] = useState(false)
  const [dismissedInSession, setDismissedInSession] = useState(false)
  const promptShownRef = useRef(false)

  useEffect(() => {
    const record = recordPwaVisit()
    if (record.installedAt) {
      setInstalled(true)
    }

    const timer = window.setTimeout(() => {
      setEngagementReady(true)
    }, PWA_INSTALL_ENGAGEMENT_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (installed) {
      return
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      markPwaInstalled()
      setInstalled(true)
      setDeferredPrompt(null)
      setDismissedInSession(true)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [installed])

  const record = readPwaInstallRecord()
  const cooldownActive = isPwaInstallCooldownActive(record)
  const hasEngagement = hasPwaInstallEngagement(record)

  const canPrompt =
    !installed && !dismissedInSession && !cooldownActive && engagementReady && hasEngagement

  const promptVariant = useMemo<PwaInstallPromptVariant>(() => {
    if (!canPrompt) {
      return null
    }

    if (deferredPrompt && isChromiumInstallContext()) {
      return "chromium"
    }

    if (isIosSafariInstallContext()) {
      return "ios"
    }

    return null
  }, [canPrompt, deferredPrompt])

  useEffect(() => {
    if (!promptVariant || promptShownRef.current) {
      return
    }

    promptShownRef.current = true
    markPwaPromptShown()
  }, [promptVariant])

  const dismissPrompt = useCallback(() => {
    markPwaInstallDismissed()
    setDismissedInSession(true)
    setDeferredPrompt(null)
  }, [])

  const install = useCallback(async () => {
    if (!deferredPrompt) {
      return
    }

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)

    if (outcome === "accepted") {
      markPwaInstalled()
      setInstalled(true)
      return
    }

    dismissPrompt()
  }, [deferredPrompt, dismissPrompt])

  const value = useMemo(
    () => ({
      promptVariant,
      canPrompt,
      dismissPrompt,
      install,
    }),
    [canPrompt, dismissPrompt, install, promptVariant],
  )

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>
}
