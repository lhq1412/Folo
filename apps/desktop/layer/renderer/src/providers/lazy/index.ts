import { lazy } from "react"

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

const LazyPwaInstallSurface = lazy(() =>
  import("~/components/common/PwaInstallSurface").then((module) => ({
    default: module.PwaInstallSurface,
  })),
)

const LazyOfflineStatusBanner = lazy(() =>
  import("~/components/common/OfflineStatusBanner").then((module) => ({
    default: module.OfflineStatusBanner,
  })),
)

export {
  LazyContextMenuProvider,
  LazyExtensionExposeProvider,
  LazyOfflineStatusBanner,
  LazyPopoverProvider,
  LazyPwaInstallSurface,
  LazyReloadPrompt,
}

const LazyExternalJumpInProvider = lazy(() =>
  import("../external-jump-in-provider").then((res) => ({
    default: res.ExternalJumpInProvider,
  })),
)
export { LazyExternalJumpInProvider }
