import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import {
  clearSubscriptionDrawerOpener,
  consumeSubscriptionDrawerOpener,
  focusSubscriptionDrawerOpener,
  getSubscriptionDrawerOpenerId,
  MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID,
  MOBILE_SUBSCRIPTION_DRAWER_HEADER_TRIGGER_ID,
  setSubscriptionDrawerOpener,
} from "./mobile-sidebar"

describe("mobile-sidebar opener restoration", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="${MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID}">entry</button>
      <button id="${MOBILE_SUBSCRIPTION_DRAWER_HEADER_TRIGGER_ID}">header</button>
    `
    setSubscriptionDrawerOpener(MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID)
  })

  afterEach(() => {
    document.body.innerHTML = ""
    clearSubscriptionDrawerOpener()
    vi.restoreAllMocks()
  })

  test("stores opener id instead of a detached DOM node", () => {
    expect(getSubscriptionDrawerOpenerId()).toBe(MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID)
  })

  test("restores focus by stable opener id after trigger remount", () => {
    const trigger = document.getElementById(MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID)
    expect(trigger).not.toBeNull()

    trigger?.remove()

    const replacement = document.createElement("button")
    replacement.id = MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID
    document.body.append(replacement)

    const openerId = consumeSubscriptionDrawerOpener()
    expect(openerId).toBe(MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID)
    expect(getSubscriptionDrawerOpenerId()).toBeNull()
    expect(focusSubscriptionDrawerOpener(openerId!)).toBe(true)
    expect(document.activeElement).toBe(replacement)
  })

  test("consumes opener identity once", () => {
    expect(consumeSubscriptionDrawerOpener()).toBe(MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID)
    expect(consumeSubscriptionDrawerOpener()).toBeNull()
    expect(getSubscriptionDrawerOpenerId()).toBeNull()
  })

  test("does not restore focus after opener identity was consumed", () => {
    const trigger = document.getElementById(MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID)
    expect(trigger).not.toBeNull()

    consumeSubscriptionDrawerOpener()
    trigger?.focus()

    expect(focusSubscriptionDrawerOpener(MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID)).toBe(true)
    expect(document.activeElement).toBe(trigger)
  })

  test("records opener id for header trigger", () => {
    setSubscriptionDrawerOpener(MOBILE_SUBSCRIPTION_DRAWER_HEADER_TRIGGER_ID)
    expect(getSubscriptionDrawerOpenerId()).toBe(MOBILE_SUBSCRIPTION_DRAWER_HEADER_TRIGGER_ID)
  })
})
