import type { PropsWithChildren } from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

import type { PwaInstallStorageRecord } from "~/lib/pwa/install-state"
import {
  clearStaleInstalledHint,
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
  const [installRecord, setInstallRecord] = useState<PwaInstallStorageRecord>(() =>
    readPwaInstallRecord(),
  )
  const [installed, setInstalled] = useState(() => isStandaloneDisplayMode())
  const [engagementReady, setEngagementReady] = useState(false)
  const [dismissedInSession, setDismissedInSession] = useState(false)
  const promptShownRef = useRef(false)

  useEffect(() => {
    const record = recordPwaVisit()
    setInstallRecord(record)

    if (isStandaloneDisplayMode()) {
      const installedRecord = markPwaInstalled()
      setInstallRecord(installedRecord)
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
    if (isStandaloneDisplayMode()) {
      setInstalled(true)
      return
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      if (readPwaInstallRecord().installedAt) {
        setInstallRecord(clearStaleInstalledHint())
      }
      setInstalled(false)
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      const nextRecord = markPwaInstalled()
      setInstallRecord(nextRecord)
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
  }, [])

  const cooldownActive = isPwaInstallCooldownActive(installRecord)
  const hasEngagement = hasPwaInstallEngagement(installRecord)

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
    setInstallRecord(markPwaPromptShown())
  }, [promptVariant])

  const dismissPrompt = useCallback(() => {
    setInstallRecord(markPwaInstallDismissed())
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
      const nextRecord = markPwaInstalled()
      setInstallRecord(nextRecord)
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
