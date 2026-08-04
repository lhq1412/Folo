import { deleteDB } from "@follow/database/db"
import { getStorageNS } from "@follow/utils/ns"

import { clearPwaRuntimeCaches } from "~/lib/pwa/cache-config"

import { clearImageDimensionsDb } from "../image/db"

export const clearLocalPersistStoreData = async () => {
  await Promise.all([deleteDB(), clearImageDimensionsDb()])
}

const storedUserId = getStorageNS("user_id")
export const clearDataIfLoginOtherAccount = async (newUserId: string) => {
  const oldUserId = localStorage.getItem(storedUserId)
  localStorage.setItem(storedUserId, newUserId)
  if (oldUserId !== newUserId) {
    await Promise.all([clearLocalPersistStoreData(), clearPwaRuntimeCaches()])
  }
}
