import { EventBus } from "@follow/utils/event-bus"
import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import type { BizRouteParams } from "~/hooks/biz/useRouteParams"
import { COMMAND_ID } from "~/modules/command/commands/id"

import { MarkAllReadButton } from "./mark-all-button"

interface ConfirmationOptions {
  duration: number
  onAutoClose: () => void
  action: { onClick: () => void }
}

const { ensureLoginMock, getRouteParamsMock, markAllByRouteMock, warningMock, dismissMock, t } =
  vi.hoisted(() => ({
    ensureLoginMock: vi.fn<() => boolean>(),
    getRouteParamsMock: vi.fn<() => BizRouteParams>(),
    markAllByRouteMock: vi.fn().mockResolvedValue(undefined),
    warningMock: vi.fn<(message: string, options: ConfirmationOptions) => number>(),
    dismissMock: vi.fn(),
    t: (key: string) => key,
  }))

vi.mock("@follow/components/common/Focusable/hooks.js", () => ({
  useGlobalFocusableScopeSelector: () => true,
}))

vi.mock("@follow/components/ui/button/index.js", () => ({
  ActionButton: ({ children, onClick }: React.ComponentProps<"button">) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))

vi.mock("@follow/components/ui/button/variants.js", () => ({
  styledButtonVariant: () => "",
}))

vi.mock("@follow/components/ui/kbd/Kbd.js", () => ({
  Kbd: () => null,
  KbdCombined: () => null,
}))

vi.mock("@follow/hooks", () => ({
  useCountdown: () => [3],
}))

vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t }),
  Trans: () => null,
}))

vi.mock("sonner", () => ({
  toast: { warning: warningMock, dismiss: dismissMock },
}))

vi.mock("~/hooks/biz/useRouteParams", () => ({
  getRouteParams: getRouteParamsMock,
}))

vi.mock("~/hooks/common", () => ({
  useI18n: vi.fn(),
}))

vi.mock("~/hooks/common/useRequireLogin", () => ({
  useRequireLogin: () => ({ ensureLogin: ensureLoginMock }),
}))

vi.mock("~/modules/command/hooks/use-command-binding", () => ({
  useCommandBinding: vi.fn(),
  useCommandShortcuts: () => ({}),
}))

vi.mock("../hooks/useMarkAll", () => ({
  markAllByRoute: markAllByRouteMock,
}))

const route: BizRouteParams = {
  feedId: "feed-before-navigation",
  view: 0,
  isCollection: false,
  isAllFeeds: false,
  isPendingEntry: false,
}

describe("MarkAllReadButton confirmation", () => {
  let root: Root | null = null
  let container: HTMLElement | null = null

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    ensureLoginMock.mockReturnValue(true)
    getRouteParamsMock.mockReturnValue(route)
    warningMock.mockImplementation((_message, options) => {
      setTimeout(options.onAutoClose, options.duration)
      return 1
    })
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
    root = null
    container = null
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  const renderButton = async () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root?.render(<MarkAllReadButton />))
    return container.querySelector("button")!
  }

  test("a toolbar click waits three seconds and marks the original route once", async () => {
    const button = await renderButton()
    await act(async () => button.click())

    expect(ensureLoginMock).toHaveBeenCalledTimes(1)
    expect(warningMock).toHaveBeenCalledTimes(1)
    expect(warningMock.mock.calls[0]![1].duration).toBe(3000)
    expect(markAllByRouteMock).not.toHaveBeenCalled()

    getRouteParamsMock.mockReturnValue({ ...route, feedId: "feed-after-navigation" })
    await act(async () => vi.advanceTimersByTime(2999))
    expect(markAllByRouteMock).not.toHaveBeenCalled()

    await act(async () => vi.advanceTimersByTime(1))
    expect(markAllByRouteMock).toHaveBeenCalledExactlyOnceWith(route)
  })

  test("Undo cancels a toolbar click even if the toast later auto-closes", async () => {
    const button = await renderButton()
    await act(async () => button.click())
    await act(async () => warningMock.mock.calls[0]![1].action.onClick())
    await act(async () => vi.advanceTimersByTime(3000))

    expect(dismissMock).toHaveBeenCalledExactlyOnceWith(1)
    expect(markAllByRouteMock).not.toHaveBeenCalled()
  })

  test("a logged-out click requests login without scheduling a read mutation", async () => {
    ensureLoginMock.mockReturnValue(false)
    const button = await renderButton()
    await act(async () => button.click())
    await act(async () => vi.advanceTimersByTime(3000))

    expect(ensureLoginMock).toHaveBeenCalledTimes(1)
    expect(warningMock).not.toHaveBeenCalled()
    expect(markAllByRouteMock).not.toHaveBeenCalled()
  })

  test("the keyboard command retains its delayed confirmation and event route", async () => {
    await renderButton()
    const commandRoute = { ...route, feedId: "feed-selected-by-command" }
    await act(async () => {
      EventBus.dispatch(COMMAND_ID.subscription.markAllAsRead, commandRoute)
    })

    expect(warningMock).toHaveBeenCalledTimes(1)
    expect(markAllByRouteMock).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(3000))
    expect(markAllByRouteMock).toHaveBeenCalledExactlyOnceWith(commandRoute)
  })
})
