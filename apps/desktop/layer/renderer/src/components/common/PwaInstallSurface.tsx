import { Button } from "@follow/components/ui/button/index.js"
import { cn } from "@follow/utils/utils"
import { m } from "motion/react"
import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"

import { usePwaInstall } from "~/providers/pwa-install-provider"

const IosPwaPrompt = lazy(() => import("react-ios-pwa-prompt"))

export function PwaInstallSurface() {
  const { promptVariant, dismissPrompt, install } = usePwaInstall()
  const { t } = useTranslation()

  if (!promptVariant) {
    return null
  }

  if (promptVariant === "ios") {
    return (
      <Suspense fallback={null}>
        <IosPwaPrompt
          appIconPath={`${window.location.origin}/apple-touch-icon-180x180.png`}
          onClose={dismissPrompt}
        />
      </Suspense>
    )
  }

  return (
    <m.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 24, opacity: 0 }}
      className={cn(
        "fixed left-4 right-4 z-[100] mx-auto max-w-md",
        "bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]",
      )}
    >
      <div
        className="rounded-2xl border border-fill bg-material-thick p-4 shadow-lg backdrop-blur-xl"
        role="dialog"
        aria-label={t("app.pwa.install_title")}
      >
        <div className="flex items-start gap-3">
          <img src="/apple-touch-icon-180x180.png" alt="" className="size-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">{t("app.pwa.install_title")}</p>
            <p className="mt-1 text-xs text-text-secondary">{t("app.pwa.install_description")}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <div className="flex-1">
            <Button size="sm" buttonClassName="w-full" onClick={() => void install()}>
              {t("app.pwa.install_button")}
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={dismissPrompt}>
            {t("app.pwa.dismiss")}
          </Button>
        </div>
      </div>
    </m.div>
  )
}
