import { afterEach, describe, expect, it } from "vitest"

import { detectUnsavedWork } from "./unsaved-work-guard"

describe("unsaved-work-guard", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("detects unsent ai chat input", () => {
    const chatInput = document.createElement("div")
    chatInput.dataset.testid = "chat-input"
    chatInput.textContent = "draft message"
    document.body.append(chatInput)

    expect(detectUnsavedWork()).toEqual({
      hasUnsavedWork: true,
      surfaces: ["ai_chat"],
    })
  })

  it("detects open search query", () => {
    const searchInput = document.createElement("input")
    searchInput.setAttribute("cmdk-input", "")
    searchInput.value = "timeline"
    document.body.append(searchInput)

    expect(detectUnsavedWork()).toEqual({
      hasUnsavedWork: true,
      surfaces: ["search"],
    })
  })

  it("returns false when no unsaved work is present", () => {
    expect(detectUnsavedWork()).toEqual({
      hasUnsavedWork: false,
      surfaces: [],
    })
  })
})
