import type { EntryModel } from "@follow/store/entry/types"

import { createZustandStore } from "../utils/helper"
import { getImageDimensionsManyFromDb } from "./db"

export interface StoreImageType {
  src: string
  width: number
  height: number
  ratio: number
  blurhash?: string
}
interface State {
  images: Record<string, StoreImageType>
}
export const useImageStore = createZustandStore<State>("image")(() => ({
  images: {},
}))

export const claimUnprocessedImageUrls = (urls: readonly string[], processedUrls: Set<string>) =>
  urls.filter((url) => {
    if (processedUrls.has(url)) return false
    processedUrls.add(url)
    return true
  })

const set = useImageStore.setState
const get = useImageStore.getState

class ImageActions {
  getImage(src: string) {
    return get().images[src]
  }

  saveImages(images: StoreImageType[]) {
    set((state) => {
      let newImages: Record<string, StoreImageType> | undefined
      for (const image of images) {
        const current = state.images[image.src]
        if (
          current === image ||
          (current?.width === image.width &&
            current.height === image.height &&
            current.ratio === image.ratio &&
            current.blurhash === image.blurhash)
        ) {
          continue
        }

        newImages ||= { ...state.images }
        newImages[image.src] = image
      }
      return newImages ? { images: newImages } : state
    })
  }

  async fetchDimensionsFromDb(images: string[]) {
    const missingImages = [...new Set(images)].filter((image) => !get().images[image])
    if (missingImages.length === 0) return

    const dimensions = (await getImageDimensionsManyFromDb(missingImages)).filter(
      (image): image is StoreImageType => !!image && !get().images[image.src],
    )
    imageActions.saveImages(dimensions)
  }

  getImagesFromEntry(entry: EntryModel) {
    const images = [] as string[]
    if (!entry.media) return images
    for (const media of entry.media) {
      if (media.type === "photo") {
        images.push(media.url)
      }
    }
    return images
  }
}
export const imageActions = new ImageActions()
/// // HOOKS
export const useImageDimensions = (url: string) => useImageStore((state) => state.images[url])
export const useImagesHasDimensions = (urls?: string[]) =>
  useImageStore((state) => (urls ? urls?.every((url) => state.images[url]) : false))
