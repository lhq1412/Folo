import type { UseStore } from "idb-keyval"
import { getMany, promisifyRequest, set } from "idb-keyval"

import type { StoreImageType } from "."

function createStore(dbName: string, storeName: string): UseStore {
  const request = indexedDB.open(dbName)
  request.onupgradeneeded = () => {
    const objectStore = request.result.createObjectStore(storeName)

    objectStore.createIndex("src", "src", { unique: true })
    return objectStore
  }
  const dbp = promisifyRequest(request)

  return (txMode, callback) =>
    dbp.then((db) => callback(db.transaction(storeName, txMode).objectStore(storeName)))
}

const db = createStore("FOLLOW_IMAGE_DIMENSIONS", "image-dimensions")
export const getImageDimensionsManyFromDb = (urls: string[]) => getMany<StoreImageType>(urls, db)

export const saveImageDimensionsToDb = (url: string, dimensions: StoreImageType) =>
  set(url, dimensions, db)

export const clearImageDimensionsDb = async () => {
  const store = await db("readwrite", (store) => store.clear())
  return store
}
