import type { EntryListResponse, FeedViewType } from "@follow-app/client-sdk"

export type EntryListItem = Omit<EntryListResponse["data"][number], "entries"> & {
  entries: EntryListResponse["data"][number]["entries"] & { content?: string | null }
}

export type EntrySession = {
  id: string
  read: boolean
  starred: boolean
  isInbox: boolean
  view?: FeedViewType
  listItem?: EntryListItem
}

export const entryIdOf = (item: EntryListItem) => item.entries.id

export const isStarred = (item: Pick<EntryListItem, "collections">) => Boolean(item.collections)

export const isInboxEntry = (item: Pick<EntryListItem, "feeds">) => {
  const type = (item.feeds as { type?: string }).type
  return type === "inbox"
}

export const starredCollectionStamp = (): NonNullable<EntryListItem["collections"]> =>
  ({ createdAt: new Date().toISOString() }) as unknown as NonNullable<EntryListItem["collections"]>

export const entrySessionFromListItem = (item: EntryListItem): EntrySession => ({
  id: entryIdOf(item),
  isInbox: isInboxEntry(item),
  listItem: item,
  read: Boolean(item.read),
  starred: isStarred(item),
  view: item.view,
})
