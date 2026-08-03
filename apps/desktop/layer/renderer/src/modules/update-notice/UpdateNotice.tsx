import { Spring } from "@follow/components/constants/spring.js"
import { Button } from "@follow/components/ui/button/index.js"
import { cn } from "@follow/utils/utils"
import { m } from "motion/react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { useAudioPlayerAtomSelector } from "~/atoms/player"
import { getUpdaterStatus, setUpdaterStatus, useUpdaterStatus } from "~/atoms/updater"
import { ipcServices } from "~/lib/client"

export const UpdateNotice = () => {
  const updaterStatus = useUpdaterStatus()
  const { t } = useTranslation()
  const playerIsShow = useAudioPlayerAtomSelector((s) => s.show)

  const handlePrimaryAction = async () => {
    const status = getUpdaterStatus()
    if (!status) {
      return
    }

    switch (status.type) {
      case "app": {
        ipcServices?.app.quitAndInstall()
        break
      }
      case "renderer": {
        ipcServices?.app.rendererUpdateReload()
        break
      }
      case "pwa": {
        await status.finishUpdate?.()
        return
      }
      case "distribution": {
        if (status.targetUrl) {
          if (ipcServices?.app.openExternal) {
            void ipcServices.app.openExternal(status.targetUrl)
          } else {
            window.open(status.targetUrl, "_blank")
          }
        }
        break
      }
    }

    setUpdaterStatus(null)
  }

  const handleDeferUpdate = () => {
    const status = getUpdaterStatus()
    if (status?.type !== "pwa") {
      return
    }

    status.deferUpdate?.()
  }

  const storeName = useMemo(() => {
    if (updaterStatus?.type !== "distribution") {
      return null
    }
    const { distribution } = updaterStatus

    switch (distribution) {
      case "direct": {
        return null
      }
      case "mas": {
        return t("notify.store.mas")
      }
      case "mss": {
        return t("notify.store.mss")
      }
      default: {
        return t("notify.store.default")
      }
    }
  }, [t, updaterStatus])

  const subtitle = useMemo(() => {
    if (!updaterStatus) return null

    switch (updaterStatus.type) {
      case "app": {
        return t("notify.update_info_1")
      }
      case "renderer": {
        return t("notify.update_info_2")
      }
      case "pwa": {
        if (updaterStatus.status === "updating") {
          return t("app.pwa.update_updating")
        }

        if (updaterStatus.status === "failed") {
          return updaterStatus.error ?? t("app.pwa.update_failed")
        }

        return t("app.pwa.update_description")
      }
      case "distribution": {
        return updaterStatus.distribution === "direct"
          ? t("notify.update_info_direct")
          : t("notify.update_info_store", { store: storeName ?? "" })
      }
      default: {
        return null
      }
    }
  }, [storeName, t, updaterStatus])

  if (!updaterStatus) return null

  if (updaterStatus.type === "pwa" && updaterStatus.status === "deferred") {
    return null
  }

  const isPwaUpdate = updaterStatus.type === "pwa"
  const showPwaActions =
    isPwaUpdate && updaterStatus.status !== "updating" && updaterStatus.status !== "failed"

  return (
    <m.div
      className={cn(
        "group absolute inset-x-3",
        playerIsShow ? "bottom-[4.5rem]" : "bottom-3",
        !isPwaUpdate && "cursor-pointer",
      )}
      onClick={!isPwaUpdate ? () => void handlePrimaryAction() : undefined}
      initial={{ y: 20, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 20, opacity: 0, scale: 0.95 }}
      transition={Spring.presets.smooth}
      whileHover={!isPwaUpdate ? { scale: 1.02 } : undefined}
      whileTap={!isPwaUpdate ? { scale: 0.98 } : undefined}
    >
      <div
        className="relative overflow-hidden rounded-xl bg-background"
        style={{
          borderWidth: "1px",
          borderStyle: "solid",
          borderColor: "rgba(255, 92, 0, 0.2)",
          boxShadow:
            "0 8px 32px rgba(255, 92, 0, 0.08), 0 4px 16px rgba(255, 92, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.1)",
        }}
      >
        <div
          className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              "linear-gradient(to bottom right, rgba(255, 92, 0, 0.05), transparent, rgba(255, 92, 0, 0.05))",
          }}
        />

        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-gray/5 to-transparent transition-transform duration-700 group-hover:translate-x-full dark:via-white/5" />

        <div className="relative flex items-center gap-3 px-4 py-2.5">
          <m.div
            className="flex-shrink-0"
            initial={{ rotate: -10 }}
            animate={{ rotate: 0 }}
            transition={{ ...Spring.presets.bouncy, delay: 0.1 }}
          >
            <div className="relative flex size-9 items-center justify-center">
              <div className="relative flex items-center justify-center">
                <i className="i-mgc-download-2-cute-re size-6 text-orange" />
              </div>
            </div>
          </m.div>

          <div className="min-w-0 flex-1 text-left">
            <m.div
              className="text-sm font-medium text-text"
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ ...Spring.presets.smooth, delay: 0.15 }}
            >
              {t("notify.update_info", { app_name: APP_NAME })}
            </m.div>
            {subtitle ? (
              <m.div
                className="mt-0.5 text-xs text-text-tertiary"
                initial={{ x: -10, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ ...Spring.presets.smooth, delay: 0.2 }}
              >
                {subtitle}
              </m.div>
            ) : null}
          </div>
        </div>

        {showPwaActions ? (
          <div className="relative flex gap-2 border-t border-fill px-4 py-2.5">
            <Button size="sm" buttonClassName="flex-1" onClick={() => void handlePrimaryAction()}>
              {t("app.pwa.update_now")}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDeferUpdate}>
              {t("app.pwa.update_later")}
            </Button>
          </div>
        ) : null}

        {isPwaUpdate && updaterStatus.status === "failed" ? (
          <div className="relative border-t border-fill px-4 py-2.5">
            <Button size="sm" buttonClassName="w-full" onClick={() => void handlePrimaryAction()}>
              {t("app.pwa.update_retry")}
            </Button>
          </div>
        ) : null}
      </div>
    </m.div>
  )
}
