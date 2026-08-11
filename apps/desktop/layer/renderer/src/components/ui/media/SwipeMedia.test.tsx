import type { MediaModel } from "@follow/database/schemas/types"
import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import { SwipeMedia } from "./SwipeMedia"

const {
  emblaApi,
  emblaHookMock,
  emitEmbla,
  listeners,
  mediaMock,
  selectedIndex,
  useMobileMock,
  wheelPlugin,
  wheelPluginMock,
} = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>()
  const selectedIndex = { current: 0 }
  const wheelPlugin = { name: "wheel-gestures" }
  const emblaRefMock = vi.fn()
  const emblaApi = {
    canScrollNext: vi.fn(() => false),
    canScrollPrev: vi.fn(() => false),
    off: vi.fn((event: string, listener: () => void) => {
      listeners.get(event)?.delete(listener)
    }),
    on: vi.fn((event: string, listener: () => void) => {
      const eventListeners = listeners.get(event) ?? new Set()
      eventListeners.add(listener)
      listeners.set(event, eventListeners)
    }),
    scrollNext: vi.fn(),
    scrollPrev: vi.fn(),
    selectedScrollSnap: vi.fn(() => selectedIndex.current),
  }

  return {
    emblaApi,
    emblaHookMock: vi.fn((_options: unknown, _plugins: unknown[]) => [emblaRefMock, emblaApi]),
    emitEmbla: (event: string) => listeners.get(event)?.forEach((listener) => listener()),
    listeners,
    mediaMock: vi.fn(
      ({
        onClick,
        src,
      }: {
        onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
        src?: string
      }) => <button data-testid="media" data-src={src} onClick={onClick} type="button" />,
    ),
    selectedIndex,
    useMobileMock: vi.fn(() => false),
    wheelPlugin,
    wheelPluginMock: vi.fn(() => wheelPlugin),
  }
})

vi.mock("@follow/components/hooks/useMobile.js", () => ({
  useMobile: useMobileMock,
}))

vi.mock("embla-carousel-react", () => ({
  default: emblaHookMock,
}))

vi.mock("embla-carousel-wheel-gestures", () => ({
  WheelGesturesPlugin: wheelPluginMock,
}))

vi.mock("~/components/ui/media/Media", () => ({
  Media: mediaMock,
}))

const makeMedia = (count: number): MediaModel[] =>
  Array.from({ length: count }, (_, index) => ({
    type: "photo",
    url: `https://example.com/${index}.jpg`,
  }))

describe("SwipeMedia", () => {
  let container: HTMLElement | null = null
  let root: Root | null = null

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    listeners.clear()
    selectedIndex.current = 0
    useMobileMock.mockReturnValue(false)
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }
    container?.remove()
    container = null
    root = null
    vi.clearAllMocks()
  })

  const render = async (element: React.ReactNode) => {
    if (!container) {
      container = document.createElement("div")
      document.body.append(container)
      root = createRoot(container)
    }

    await act(async () => {
      root?.render(element)
    })
  }

  test("disables single-item Embla and skips wheel gestures on mobile", async () => {
    await render(<SwipeMedia media={makeMedia(1)} />)

    expect(emblaHookMock).toHaveBeenLastCalledWith({ active: false, loop: true }, [])
    expect(wheelPluginMock).not.toHaveBeenCalled()

    useMobileMock.mockReturnValue(true)
    await render(<SwipeMedia media={makeMedia(2)} />)

    expect(emblaHookMock).toHaveBeenLastCalledWith({ active: true, loop: true }, [])
    expect(wheelPluginMock).not.toHaveBeenCalled()
  })

  test("keeps the desktop wheel plugin identity stable", async () => {
    const media = makeMedia(2)
    await render(<SwipeMedia media={media} />)
    const firstPlugins = emblaHookMock.mock.calls.at(-1)?.[1]

    await render(<SwipeMedia className="rerender" media={media} />)
    const nextPlugins = emblaHookMock.mock.calls.at(-1)?.[1]

    expect(wheelPluginMock).toHaveBeenCalledTimes(1)
    expect(firstPlugins).toBe(nextPlugins)
    expect(nextPlugins).toEqual([wheelPlugin])
  })

  test("keeps every slide wrapper while mounting only the active window", async () => {
    const onPreview = vi.fn()
    const media = makeMedia(5)
    await render(<SwipeMedia media={[...media, media[0]!]} onPreview={onPreview} />)

    const getMountedSources = () =>
      Array.from(container?.querySelectorAll('[data-testid="media"]') ?? []).map((element) =>
        element.getAttribute("data-src"),
      )

    expect(container?.querySelector(".flex.size-full")?.children).toHaveLength(5)
    expect(getMountedSources()).toEqual([media[0]!.url, media[1]!.url, media[4]!.url])
    expect(emblaApi.on).toHaveBeenCalledWith("select", expect.any(Function))
    expect(emblaApi.on).toHaveBeenCalledWith("reInit", expect.any(Function))

    selectedIndex.current = 2
    await act(async () => emitEmbla("select"))
    expect(getMountedSources()).toEqual([media[1]!.url, media[2]!.url, media[3]!.url])

    await act(async () => {
      container
        ?.querySelector(`[data-src="${media[2]!.url}"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(onPreview).toHaveBeenCalledWith(media, 2)

    selectedIndex.current = 4
    await act(async () => emitEmbla("select"))
    await render(<SwipeMedia media={media.slice(0, 4)} onPreview={onPreview} />)
    await act(async () => emitEmbla("reInit"))
    expect(container?.querySelector(".flex.size-full")?.children).toHaveLength(4)
    expect(getMountedSources()).toHaveLength(3)

    await render(<SwipeMedia media={media.slice(0, 3)} onPreview={onPreview} />)
    expect(getMountedSources()).toHaveLength(3)
  })
})
