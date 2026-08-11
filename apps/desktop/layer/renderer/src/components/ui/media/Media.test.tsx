import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import { Media } from "./Media"

const {
  playMock,
  saveImageDimensionsToDbMock,
  saveImagesMock,
  useMobileMock,
  videoPlayerMock,
  videoPlayerMountMock,
  videoPlayerRef,
} = vi.hoisted(() => {
  const playMock = vi.fn(() => Promise.resolve())
  return {
    playMock,
    saveImageDimensionsToDbMock: vi.fn(),
    saveImagesMock: vi.fn(),
    useMobileMock: vi.fn(() => false),
    videoPlayerMock: vi.fn(),
    videoPlayerMountMock: vi.fn(),
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

vi.mock("~/lib/img-proxy", async () => {
  const { getImageProxyUrl } = await import("@follow/utils/img-proxy")

  return {
    useGetImageProxyUrl:
      () => (params: Omit<Parameters<typeof getImageProxyUrl>[0], "canUseProxy">) =>
        getImageProxyUrl({ ...params, canUseProxy: true }),
  }
})

vi.mock("~/store/image/db", () => ({
  saveImageDimensionsToDb: saveImageDimensionsToDbMock,
}))

vi.mock("~/store/image", () => ({
  imageActions: {
    saveImages: saveImagesMock,
  },
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
      videoPlayerMountMock()
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

  test("initializes and plays an inline player only after a mobile tap", async () => {
    useMobileMock.mockReturnValue(true)
    await render(<Media src="https://example.com/video.mp4" type="video" />)

    const preview = container?.querySelector(".i-mgc-play-cute-fi")?.parentElement?.parentElement

    await act(async () => {
      preview?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    })

    expect(videoPlayerMock).not.toHaveBeenCalled()
    expect(container?.querySelector(".bg-material-ultra-thick")).not.toBeNull()

    await act(async () => {
      preview?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(playMock).toHaveBeenCalledTimes(1)
    expect(videoPlayerMountMock).toHaveBeenCalledTimes(1)
    expect(container?.querySelector('[data-testid="video-player"]')).not.toBeNull()

    await act(async () => {
      root?.render(<Media src="https://example.com/video.mp4" type="video" />)
    })

    expect(videoPlayerMountMock).toHaveBeenCalledTimes(1)
  })

  test("leaves mobile video playback to an external click handler", async () => {
    useMobileMock.mockReturnValue(true)
    const onClick = vi.fn()
    await render(<Media src="https://example.com/video.mp4" type="video" onClick={onClick} />)

    await act(async () => {
      container
        ?.querySelector(".i-mgc-play-cute-fi")
        ?.parentElement?.parentElement?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(videoPlayerMock).not.toHaveBeenCalled()
  })

  test("stores loaded photo dimensions in memory and IndexedDB", async () => {
    const src = "https://example.com/photo.jpg"
    await render(<Media cacheDimensions src={src} type="photo" />)
    const image = container?.querySelector("img")
    Object.defineProperties(image, {
      naturalHeight: { value: 200 },
      naturalWidth: { value: 400 },
    })

    await act(async () => {
      image?.dispatchEvent(new Event("load", { bubbles: true }))
    })

    const dimensions = { height: 200, ratio: 2, src, width: 400 }
    expect(saveImagesMock).toHaveBeenCalledWith([dimensions])
    expect(saveImageDimensionsToDbMock).toHaveBeenCalledWith(src, dimensions)
  })

  test("does not wrap an existing Folo proxy image again", async () => {
    const proxied = `https://img.folo.is/?url=${encodeURIComponent("https://example.com/photo.jpg")}`

    await render(
      <Media preferOrigin={false} proxy={{ height: 0, width: 720 }} src={proxied} type="photo" />,
    )

    expect(container?.querySelector("img")?.getAttribute("src")).toBe(proxied)
  })
})
