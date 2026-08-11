import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"

import { MarkdownRenderActionContext } from "../context"
import { MarkdownBlockImage } from "./BlockImage"

const { mediaMock, getWrappedElementSizeMock } = vi.hoisted(() => ({
  mediaMock: vi.fn(
    ({
      blurhash: _blurhash,
      mediaContainerClassName: _mediaContainerClassName,
      popper: _popper,
      proxy: _proxy,
      showFallback: _showFallback,
      type: _type,
      ...props
    }: React.ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>) => (
      <img alt="" data-testid="media" {...props} />
    ),
  ),
  getWrappedElementSizeMock: vi.fn(() => ({ h: 0, w: 640 })),
}))

vi.mock("../../media/Media", () => ({
  Media: mediaMock,
}))

vi.mock("~/providers/wrapped-element-provider", () => ({
  useWrappedElementSize: getWrappedElementSizeMock,
}))

const renderComponent = async (element: React.ReactNode) => {
  const container = document.createElement("div")
  document.body.append(container)

  const root = createRoot(container)

  await act(async () => {
    root.render(element)
  })

  return { container, root }
}

describe("MarkdownBlockImage", () => {
  let root: Root | null = null
  let container: HTMLElement | null = null

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }

    container?.remove()
    root = null
    container = null
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    getWrappedElementSizeMock.mockReturnValue({ h: 0, w: 640 })
  })

  test("passes image context menu events with the resolved image URL", async () => {
    const onImageContextMenu = vi.fn()

    ;({ container, root } = await renderComponent(
      <MarkdownRenderActionContext
        value={{
          ensureAndRenderTimeStamp: () => false,
          isAudio: () => false,
          onImageContextMenu,
          transformUrl: (url) => (url ? new URL(url, "https://example.com/post").href : url),
        }}
      >
        <MarkdownBlockImage src="./image.png" width={700} height={400} />
      </MarkdownRenderActionContext>,
    ))

    const image = container?.querySelector('[data-testid="media"]')
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 34,
    })

    await act(async () => {
      image?.dispatchEvent(event)
    })

    expect(onImageContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({ clientX: 12, clientY: 34 }),
      "https://example.com/image.png",
    )
  })

  test("loads block images from a stable proxy size before the origin fallback", async () => {
    vi.stubGlobal("devicePixelRatio", 2)
    vi.stubGlobal("innerWidth", 390)
    getWrappedElementSizeMock.mockReturnValue({ h: 0, w: 0 })

    const image = () => (
      <MarkdownRenderActionContext
        value={{
          ensureAndRenderTimeStamp: () => false,
          isAudio: () => false,
          transformUrl: (url) => url,
        }}
      >
        <MarkdownBlockImage
          src="https://cdn.example.com/article.jpg"
          proxy={{ height: 0, width: 700 }}
        />
      </MarkdownRenderActionContext>
    )

    ;({ container, root } = await renderComponent(image()))

    const initialProps = mediaMock.mock.calls.at(-1)?.[0]
    expect(initialProps).toMatchObject({
      decoding: "async",
      preferOrigin: false,
      proxy: { height: 0, width: 960 },
      src: "https://cdn.example.com/article.jpg",
    })

    getWrappedElementSizeMock.mockReturnValue({ h: 0, w: 390 })
    await act(async () => {
      root?.render(image())
    })

    expect(mediaMock.mock.calls.at(-1)?.[0].proxy).toBe(initialProps?.proxy)
  })

  test("caps device pixel ratio when choosing a proxy width", async () => {
    vi.stubGlobal("devicePixelRatio", 3)
    getWrappedElementSizeMock.mockReturnValue({ h: 0, w: 300 })

    ;({ container, root } = await renderComponent(
      <MarkdownRenderActionContext
        value={{
          ensureAndRenderTimeStamp: () => false,
          isAudio: () => false,
          transformUrl: (url) => url,
        }}
      >
        <MarkdownBlockImage
          src="https://cdn.example.com/article.jpg"
          proxy={{ height: 0, width: 700 }}
        />
      </MarkdownRenderActionContext>,
    ))

    expect(mediaMock.mock.calls.at(-1)?.[0].proxy).toEqual({ height: 0, width: 720 })
  })
})
