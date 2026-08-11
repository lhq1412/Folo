import { cn } from "@follow/utils/utils"
import { use, useMemo } from "react"
import { useContextSelector } from "use-context-selector"

import { useWrappedElementSize } from "~/providers/wrapped-element-provider"

import { Media } from "../../media/Media"
import { MarkdownImageRecordContext, MarkdownRenderActionContext } from "../context"

const PROXY_WIDTHS = [480, 720, 960, 1280] as const

export const MarkdownBlockImage = (
  props: React.ImgHTMLAttributes<HTMLImageElement> & {
    proxy?: {
      width: number
      height: number
    }
  },
) => {
  const size = useWrappedElementSize()
  const hasProxy = !!props.proxy
  const declaredWidth = Number(props.width) || props.proxy?.width || PROXY_WIDTHS[0]
  const renderedWidth = Math.min(size.w || globalThis.innerWidth || declaredWidth, declaredWidth)
  const targetProxyWidth =
    renderedWidth * Math.min(Math.max(globalThis.devicePixelRatio || 1, 1), 2)
  const proxyWidth = PROXY_WIDTHS.find((width) => width >= targetProxyWidth) ?? PROXY_WIDTHS.at(-1)!
  const proxy = useMemo(
    () => (hasProxy ? { height: 0, width: proxyWidth } : undefined),
    [hasProxy, proxyWidth],
  )

  const { onImageContextMenu, transformUrl } = use(MarkdownRenderActionContext)
  const src = transformUrl(props.src)
  const handleContextMenu = (event: React.MouseEvent<HTMLImageElement>) => {
    props.onContextMenu?.(event)

    if (src) {
      void onImageContextMenu?.(event, src)
    }
  }

  const media = useContextSelector(MarkdownImageRecordContext, (record) =>
    props.src ? record[props.src] : null,
  )

  return (
    <Media
      type="photo"
      {...props}
      decoding="async"
      loading="lazy"
      preferOrigin={false}
      proxy={proxy}
      src={src}
      height={media?.height || props.height}
      width={media?.width || props.width}
      blurhash={media?.blurhash}
      onContextMenu={handleContextMenu}
      mediaContainerClassName={cn(
        "rounded",
        size.w < Number.parseInt(props.width as string) && "w-full",
      )}
      showFallback
      popper
      className="my-8 flex justify-center"
    />
  )
}
