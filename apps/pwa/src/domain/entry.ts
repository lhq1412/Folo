import type { EntryListResponse } from "@follow-app/client-sdk"

export type EntryListItem = Omit<EntryListResponse["data"][number], "entries"> & {
  entries: EntryListResponse["data"][number]["entries"] & { content?: string | null }
}
