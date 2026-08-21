// @vitest-environment jsdom

import { describe, expect, test } from "vitest"

import {
  clearSessionSnapshot,
  readSessionSnapshot,
  SESSION_SNAPSHOT_STORAGE_KEY,
  writeSessionSnapshot,
} from "./session-snapshot"

describe("session snapshot", () => {
  test("stores only userId, name, and email", () => {
    writeSessionSnapshot({ email: "ada@example.com", name: "Ada", userId: "user-1" })
    const raw = localStorage.getItem(SESSION_SNAPSHOT_STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw ?? "{}")).toEqual({
      email: "ada@example.com",
      name: "Ada",
      userId: "user-1",
    })
    expect(raw).not.toMatch(/token|password|secret/i)
    expect(readSessionSnapshot()).toEqual({
      email: "ada@example.com",
      name: "Ada",
      userId: "user-1",
    })
    clearSessionSnapshot()
    expect(readSessionSnapshot()).toBeNull()
  })

  test("ignores malformed snapshots", () => {
    localStorage.setItem(SESSION_SNAPSHOT_STORAGE_KEY, '{"name":"Ada"}')
    expect(readSessionSnapshot()).toBeNull()
    localStorage.setItem(SESSION_SNAPSHOT_STORAGE_KEY, "not-json")
    expect(readSessionSnapshot()).toBeNull()
  })
})
