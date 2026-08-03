// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, test } from "vitest"

import {
  getFocusableElements,
  handleMobileDrawerFocusTrapKeyDown,
} from "./mobile-subscription-drawer-focus-trap"

describe("handleMobileDrawerFocusTrapKeyDown", () => {
  let drawer: HTMLDivElement
  let firstButton: HTMLButtonElement
  let secondButton: HTMLButtonElement
  let thirdButton: HTMLButtonElement

  beforeEach(() => {
    drawer = document.createElement("div")
    firstButton = document.createElement("button")
    secondButton = document.createElement("button")
    thirdButton = document.createElement("button")

    firstButton.textContent = "first"
    secondButton.textContent = "second"
    thirdButton.textContent = "third"

    drawer.append(firstButton, secondButton, thirdButton)
    document.body.append(drawer)
  })

  afterEach(() => {
    document.body.innerHTML = ""
  })

  test("cycles forward through all focusable elements", () => {
    firstButton.focus()

    expect(
      handleMobileDrawerFocusTrapKeyDown(
        { key: "Tab", shiftKey: false },
        drawer,
        document.activeElement,
        () => {},
      ),
    ).toBe(true)
    expect(document.activeElement).toBe(secondButton)

    expect(
      handleMobileDrawerFocusTrapKeyDown(
        { key: "Tab", shiftKey: false },
        drawer,
        document.activeElement,
        () => {},
      ),
    ).toBe(true)
    expect(document.activeElement).toBe(thirdButton)

    expect(
      handleMobileDrawerFocusTrapKeyDown(
        { key: "Tab", shiftKey: false },
        drawer,
        document.activeElement,
        () => {},
      ),
    ).toBe(true)
    expect(document.activeElement).toBe(firstButton)
  })

  test("cycles backward through all focusable elements", () => {
    firstButton.focus()

    expect(
      handleMobileDrawerFocusTrapKeyDown(
        { key: "Tab", shiftKey: true },
        drawer,
        document.activeElement,
        () => {},
      ),
    ).toBe(true)
    expect(document.activeElement).toBe(thirdButton)
  })

  test("moves focus into the drawer when active element is outside", () => {
    const outsideButton = document.createElement("button")
    document.body.append(outsideButton)
    outsideButton.focus()

    expect(
      handleMobileDrawerFocusTrapKeyDown(
        { key: "Tab", shiftKey: false },
        drawer,
        document.activeElement,
        () => {},
      ),
    ).toBe(true)
    expect(document.activeElement).toBe(firstButton)
    expect(getFocusableElements(drawer)).toHaveLength(3)
  })

  test("closes the drawer on Escape", () => {
    let closed = false
    firstButton.focus()

    expect(
      handleMobileDrawerFocusTrapKeyDown(
        { key: "Escape", shiftKey: false },
        drawer,
        document.activeElement,
        () => {
          closed = true
        },
      ),
    ).toBe(true)
    expect(closed).toBe(true)
  })
})
