import { useMobile } from "@follow/components/hooks/useMobile.js"
import { Folo } from "@follow/components/icons/folo.js"
import { Logo } from "@follow/components/icons/logo.jsx"
import { ActionButton } from "@follow/components/ui/button/index.js"
import { stopPropagation } from "@follow/utils/dom"
import { cn } from "@follow/utils/utils"
import { m } from "motion/react"
import type { FC, PropsWithChildren } from "react"
import { memo, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router"
import { toast } from "sonner"

import { useSubscriptionColumnShow, useSubscriptionColumnTempShow } from "~/atoms/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu/dropdown-menu"
import { useBackHome } from "~/hooks/biz/useNavigateEntry"
import { useRouteParamsSelector } from "~/hooks/biz/useRouteParams"
import { useI18n } from "~/hooks/common"
import { useContextMenu } from "~/hooks/common/useContextMenu"
import { copyToClipboard } from "~/lib/clipboard"
import { MOBILE_SUBSCRIPTION_DRAWER_ID, toggleSubscriptionSidebar } from "~/lib/mobile-sidebar"
import { ProfileButton } from "~/modules/user/ProfileButton"

export const SubscriptionColumnHeader = memo(() => {
  const timelineId = useRouteParamsSelector((s) => s.timelineId)
  const navigateBackHome = useBackHome(timelineId)
  const navigate = useNavigate()
  const location = useLocation()
  const normalStyle = !window.electron || window.electron.process.platform !== "darwin"
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        "ml-5 mr-3 flex items-center",

        normalStyle ? "ml-4 justify-between" : "justify-end",
      )}
    >
      {normalStyle && (
        <LogoContextMenu>
          <div
            className="relative flex items-center gap-1 text-lg font-semibold"
            onClick={(e) => {
              e.stopPropagation()
              navigateBackHome()
            }}
          >
            <Logo className="mr-1 size-6" />
            <Folo className="size-8" />
          </div>
        </LogoContextMenu>
      )}
      <div className="relative flex items-center gap-2" onClick={stopPropagation}>
        <ActionButton
          data-testid="subscription-discover-trigger"
          shortcut="$mod+T"
          tooltip={t("words.discover")}
          onClick={() => {
            if (location.pathname !== "/discover") {
              navigate("/discover")
            }
          }}
        >
          <i className="i-mgc-add-cute-re size-5 text-text-secondary" />
        </ActionButton>

        <ProfileButton method="modal" animatedAvatar />
        <LayoutActionButton />
      </div>
    </div>
  )
})

const LayoutActionButton = () => {
  const feedColumnShow = useSubscriptionColumnShow()
  const feedColumnTempShow = useSubscriptionColumnTempShow()
  const isMobileViewport = useMobile()
  const subscriptionSidebarOpen = feedColumnShow || feedColumnTempShow

  const [animation, setAnimation] = useState({ width: !subscriptionSidebarOpen ? "auto" : 0 })
  useEffect(() => {
    setAnimation({ width: !subscriptionSidebarOpen ? "auto" : 0 })
  }, [subscriptionSidebarOpen])

  const t = useI18n()

  if (subscriptionSidebarOpen && !isMobileViewport) return null

  return (
    <m.div initial={animation} animate={animation} className="overflow-hidden">
      <ActionButton
        tooltip={t("app.toggle_sidebar")}
        aria-expanded={subscriptionSidebarOpen}
        aria-controls={isMobileViewport ? MOBILE_SUBSCRIPTION_DRAWER_ID : undefined}
        icon={
          <i
            className={cn(
              !subscriptionSidebarOpen
                ? "i-mgc-layout-leftbar-open-cute-re"
                : "i-mgc-layout-leftbar-close-cute-re",
              "text-text-secondary",
            )}
          />
        }
        onClick={() => {
          toggleSubscriptionSidebar(feedColumnShow, feedColumnTempShow)
        }}
      />
    </m.div>
  )
}

const LogoContextMenu: FC<PropsWithChildren> = ({ children }) => {
  const [open, setOpen] = useState(false)
  const logoRef = useRef<SVGSVGElement>(null)
  const t = useI18n()
  const contextMenuProps = useContextMenu({
    onContextMenu: () => {
      setOpen(true)
    },
  })

  const logoTextRef = useRef<SVGSVGElement>(null)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild {...contextMenuProps}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onClick={() => {
            copyToClipboard(logoRef.current?.outerHTML || "")
            setOpen(false)
            toast.success(t.common("app.copied_to_clipboard"))
          }}
        >
          <Logo ref={logoRef} className="hidden" />
          <span>{t("app.copy_logo_svg")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            copyToClipboard(logoTextRef.current?.outerHTML || "")
            setOpen(false)
            toast.success(t.common("app.copied_to_clipboard"))
          }}
        >
          <Folo ref={logoTextRef} className="hidden" />
          <span>{t("app.copy_logo_text_svg")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
