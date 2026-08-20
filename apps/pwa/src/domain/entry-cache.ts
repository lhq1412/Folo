import type { InfiniteData } from "@tanstack/react-query"

import type { EntryListItem } from "./entry"
import { entryIdOf } from "./entry"

export type EntryListPage = { data: EntryListItem[] }
export type EntryInfiniteData = InfiniteData<EntryListPage, string | undefined>

export const findEntryInInfiniteData = (
  data: EntryInfiniteData | undefined,
  entryId: string,
): EntryListItem | undefined => {
  if (!data) return undefined
  for (const page of data.pages) {
    const item = page.data.find((entry) => entryIdOf(entry) === entryId)
    if (item) return item
  }
  return undefined
}

export const mapEntriesInInfiniteData = (
  data: EntryInfiniteData | undefined,
  mapFn: (item: EntryListItem) => EntryListItem | null,
): EntryInfiniteData | undefined => {
  if (!data) return data

  let changed = false
  const pages = data.pages.map((page) => {
    let pageChanged = false
    const nextItems: EntryListItem[] = []
    for (const item of page.data) {
      const mapped = mapFn(item)
      if (mapped === null) {
        pageChanged = true
        continue
      }
      if (mapped !== item) {
        pageChanged = true
        nextItems.push(mapped)
      } else {
        nextItems.push(item)
      }
    }
    if (!pageChanged) return page
    changed = true
    return { ...page, data: nextItems }
  })

  if (!changed) return data
  return { ...data, pages }
}

export const prependEntryInInfiniteData = (
  data: EntryInfiniteData | undefined,
  item: EntryListItem,
): EntryInfiniteData => {
  if (!data || data.pages.length === 0) {
    return {
      pageParams: [undefined],
      pages: [{ data: [item] }],
    }
  }

  const firstPage = data.pages[0]
  if (!firstPage) {
    return {
      ...data,
      pages: [{ data: [item] }, ...data.pages],
    }
  }

  return {
    ...data,
    pages: [{ ...firstPage, data: [item, ...firstPage.data] }, ...data.pages.slice(1)],
  }
}
