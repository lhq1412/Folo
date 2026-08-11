import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getImageDimensionsManyFromDb, saveImageDimensionsToDb } from "./db"
import type { StoreImageType } from "./index"
import { claimUnprocessedImageUrls, imageActions, useImageStore } from "./index"

const createImage = (src: string, width: number): StoreImageType => ({
  src,
  width,
  height: width / 2,
  ratio: 2,
})

describe("image dimensions", () => {
  beforeEach(() => {
    useImageStore.setState({ images: {} })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("writes dimensions without a read transaction", async () => {
    const image = createImage("https://example.com/direct-write.jpg", 200)
    const transactions = vi.spyOn(IDBDatabase.prototype, "transaction")

    await saveImageDimensionsToDb(image.src, image)

    expect(transactions).toHaveBeenCalledTimes(1)
    expect(transactions.mock.calls[0]?.[1]).toBe("readwrite")
    expect(await getImageDimensionsManyFromDb([image.src])).toEqual([image])
  })

  it("restores unique missing images in one transaction without replacing API dimensions", async () => {
    const stale = createImage("https://example.com/stale.jpg", 100)
    const cached = createImage("https://example.com/cached.jpg", 300)
    const api = createImage(stale.src, 400)
    await saveImageDimensionsToDb(stale.src, stale)
    await saveImageDimensionsToDb(cached.src, cached)

    const transactions = vi.spyOn(IDBDatabase.prototype, "transaction")
    const restore = imageActions.fetchDimensionsFromDb([
      stale.src,
      stale.src,
      cached.src,
      cached.src,
    ])
    imageActions.saveImages([api])
    await restore

    expect(transactions).toHaveBeenCalledTimes(1)
    expect(transactions.mock.calls[0]?.[1]).toBe("readonly")
    expect(imageActions.getImage(stale.src)).toEqual(api)
    expect(imageActions.getImage(cached.src)).toEqual(cached)
  })

  it("keeps the store state when dimensions are unchanged", () => {
    const image = createImage("https://example.com/unchanged.jpg", 200)
    imageActions.saveImages([image])
    const state = useImageStore.getState()

    imageActions.saveImages([{ ...image }])

    expect(useImageStore.getState()).toBe(state)
  })

  it("claims dimensions by image URL and releases failed attempts for retry", () => {
    const processedUrls = new Set<string>()
    const first = "https://example.com/first.jpg"
    const addedLater = "https://example.com/added-later.jpg"

    expect(claimUnprocessedImageUrls([first], processedUrls)).toEqual([first])
    expect(claimUnprocessedImageUrls([first, addedLater], processedUrls)).toEqual([addedLater])

    processedUrls.delete(addedLater)
    expect(claimUnprocessedImageUrls([addedLater], processedUrls)).toEqual([addedLater])
  })

  it("replaces dimensions when the API updates an existing image URL", () => {
    const initial = createImage("https://example.com/updated.jpg", 200)
    const updated = createImage(initial.src, 400)

    imageActions.saveImages([initial])
    imageActions.saveImages([updated])

    expect(imageActions.getImage(initial.src)).toEqual(updated)
  })
})
