import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import { Media } from "./Media"

const { playMock, useMobileMock, videoPlayerMock, videoPlayerRef } = vi.hoisted(() => {
  const playMock = vi.fn(() => Promise.resolve())
  return {
    playMock,
    useMobileMock: vi.fn(() => false),
    videoPlayerMock: vi.fn(),
    videoPlayerRef: {
      controls: {
        pause: vi.fn(),
        play: playMock,
      },
      getState: () => ({ paused: true }),
    },
  }
})

vi.mock("@follow/components/hooks/useMobile.js", () => ({
  useMobile: useMobileMock,
}))

vi.mock("motion/react", () => ({
  useForceUpdate: () => [vi.fn()],
}))

vi.mock("~/lib/img-proxy", () => ({
  useGetImageProxyUrl:
    () =>
    ({ url }: { url: string }) =>
      url,
}))

vi.mock("~/store/image/db", () => ({
  saveImageDimensionsToDb: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useMediaContainerWidth: () => undefined,
  usePreviewMedia: () => vi.fn(),
}))

vi.mock("./VideoPlayer", () => ({
  VideoPlayer: (props: {
    poster?: string
    preload?: string
    ref?: (ref: typeof videoPlayerRef | null) => void
    src: string
    variant?: string
  }) => {
    videoPlayerMock(props)
    const { ref } = props
    React.useEffect(() => {
      ref?.(videoPlayerRef)
      return () => ref?.(null)
    }, [ref])
    return (
      <video
        data-testid="video-player"
        data-variant={props.variant}
        poster={props.poster}
        preload={props.preload}
        src={props.src}
      />
    )
  },
}))

describe("Media video preview", () => {
  let container: HTMLElement | null = null
  let root: Root | null = null

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
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
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(element)
    })
  }

  test.each([
    { expectedVariant: "preview", poster: "https://example.com/poster.jpg", thumbnail: false },
    { expectedVariant: "thumbnail", poster: undefined, thumbnail: true },
  ])(
    "defers the $expectedVariant player until desktop hover",
    async ({ expectedVariant, poster, thumbnail }) => {
      await render(
        <Media
          previewImageUrl={poster}
          src="https://example.com/video.mp4"
          thumbnail={thumbnail}
          type="video"
        />,
      )

      expect(videoPlayerMock).not.toHaveBeenCalled()
      expect(container?.querySelector(".i-mgc-play-cute-fi")).not.toBeNull()

      if (poster) {
        const image = container?.querySelector("img")
        expect(image?.getAttribute("loading")).toBe("lazy")
        expect(image?.getAttribute("decoding")).toBe("async")
      } else {
        expect(container?.querySelector(".bg-material-ultra-thick")).not.toBeNull()
      }

      await act(async () => {
        const preview =
          container?.querySelector(".i-mgc-play-cute-fi")?.parentElement?.parentElement
        preview?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
      })

      expect(videoPlayerMock).toHaveBeenCalledWith(
        expect.objectContaining({ preload: "none", variant: expectedVariant }),
      )
      expect(playMock).toHaveBeenCalledTimes(1)
      expect(container?.querySelector('[data-testid="video-player"]')).not.toBeNull()
    },
  )

  test("never initializes an inline player on mobile", async () => {
    useMobileMock.mockReturnValue(true)
    await render(<Media src="https://example.com/video.mp4" type="video" />)

    await act(async () => {
      const preview = container?.querySelector(".i-mgc-play-cute-fi")?.parentElement?.parentElement
      preview?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    })

    expect(videoPlayerMock).not.toHaveBeenCalled()
    expect(container?.querySelector(".bg-material-ultra-thick")).not.toBeNull()
  })
})
