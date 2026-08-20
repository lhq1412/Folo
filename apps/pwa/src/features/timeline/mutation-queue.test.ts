import { describe, expect, test } from "vitest"

import { enqueueEntryMutation } from "./mutation-queue"

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe("entry mutation queue", () => {
  test("runs mutations for the same entry one after another", async () => {
    const log: number[] = []
    await Promise.all([
      enqueueEntryMutation("entry-a", async () => {
        await wait(20)
        log.push(1)
      }),
      enqueueEntryMutation("entry-a", async () => {
        log.push(2)
      }),
    ])
    expect(log).toEqual([1, 2])
  })

  test("keeps different entries independent", async () => {
    const log: string[] = []
    await Promise.all([
      enqueueEntryMutation("entry-a", async () => {
        await wait(20)
        log.push("a")
      }),
      enqueueEntryMutation("entry-b", async () => {
        log.push("b")
      }),
    ])
    expect(log).toEqual(["b", "a"])
  })
})
