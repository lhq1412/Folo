import { unreadSyncService } from "@follow/store/unread/store"
import { whoami } from "@follow/store/user/getters"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { markGuestEntriesAsRead } from "~/atoms/guest-read"

import { batchMarkRead } from "./useEntryMarkReadHandler"

vi.mock("@follow/store/unread/store", () => ({
  unreadSyncService: {
    queueEntriesAsRead: vi.fn(),
  },
}))

vi.mock("@follow/store/user/getters", () => ({ whoami: vi.fn() }))
vi.mock("~/atoms/guest-read", () => ({ markGuestEntriesAsRead: vi.fn() }))

describe("batchMarkRead", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(whoami).mockReturnValue(null)
  })

  it("queues ids without requiring entries to exist in the local store", () => {
    vi.mocked(whoami).mockReturnValue({ id: "user-1" } as NonNullable<ReturnType<typeof whoami>>)
    batchMarkRead(["entry-1", "entry-2"])

    expect(unreadSyncService.queueEntriesAsRead).toHaveBeenCalledWith(["entry-1", "entry-2"])
    expect(markGuestEntriesAsRead).not.toHaveBeenCalled()
  })

  it("keeps anonymous scroll reads local instead of queuing account writes", () => {
    batchMarkRead(["entry-1", "entry-2"])

    expect(markGuestEntriesAsRead).toHaveBeenCalledWith(["entry-1", "entry-2"])
    expect(unreadSyncService.queueEntriesAsRead).not.toHaveBeenCalled()
  })

  it("ignores empty ranges", () => {
    batchMarkRead([])

    expect(markGuestEntriesAsRead).not.toHaveBeenCalled()
    expect(unreadSyncService.queueEntriesAsRead).not.toHaveBeenCalled()
  })
})
