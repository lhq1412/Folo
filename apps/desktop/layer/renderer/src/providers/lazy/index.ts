import { createElement, lazy, Suspense, useState } from "react"

const LazyContextMenuProvider = lazy(() =>
  import("./../context-menu-provider").then((res) => ({
    default: res.ContextMenuProvider,
  })),
)
const LazyPopoverProvider = lazy(() =>
  import("./../popover-provider").then((res) => ({
    default: res.PopoverProvider,
  })),
)

const LazyExtensionExposeProvider = lazy(() =>
  import("./../extension-expose-provider").then((res) => ({
    default: res.ExtensionExposeProvider,
  })),
)

const LazyReloadPrompt = lazy(() =>
  import("~/components/common/ReloadPrompt").then((module) => ({
    default: module.ReloadPrompt,
  })),
)

const LazyPWAPromptImport = lazy(() => import("react-ios-pwa-prompt"))

const LazyPWAInstallPromptImport = lazy(() =>
  import("~/components/common/PWAInstallPrompt").then((module) => ({
    default: module.PWAInstallPrompt,
  })),
)

const LazyPWAPrompt = () => {
  const [show, setShow] = useState(true)
  if (!show) return null
  return createElement(
    Suspense,
    null,
    createElement(LazyPWAPromptImport, {
      onClose() {
        setTimeout(() => {
          setShow(false)
        }, 250)
      },

      appIconPath: `${window.location.origin}/apple-touch-icon-180x180.png`,
    }),
  )
}

const LazyPWAInstallPrompt = () => {
  return createElement(Suspense, null, createElement(LazyPWAInstallPromptImport))
}

export {
  LazyContextMenuProvider,
  LazyExtensionExposeProvider,
  LazyPopoverProvider,
  LazyPWAInstallPrompt,
  LazyPWAPrompt,
  LazyReloadPrompt,
}

const LazyExternalJumpInProvider = lazy(() =>
  import("../external-jump-in-provider").then((res) => ({
    default: res.ExternalJumpInProvider,
  })),
)
export { LazyExternalJumpInProvider }
