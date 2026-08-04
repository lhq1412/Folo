import { useIsOnline } from "@follow/hooks"
import { cn } from "@follow/utils/utils"
import { AnimatePresence, m } from "motion/react"
import { useTranslation } from "react-i18next"

export function OfflineStatusBanner() {
  const isOnline = useIsOnline()
  const { t } = useTranslation()

  return (
    <AnimatePresence>
      {!isOnline ? (
        <m.div
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          className={cn(
            "pointer-events-none fixed inset-x-0 top-0 z-[120] flex justify-center px-3",
            "pt-[calc(0.5rem+env(safe-area-inset-top,0px))]",
          )}
        >
          <div className="rounded-full border border-fill bg-material-thick px-3 py-1.5 text-xs text-text-secondary shadow-md backdrop-blur-xl">
            {t("app.pwa.offline_status")}
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  )
}
