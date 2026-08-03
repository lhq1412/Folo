export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function getFocusableElements(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
  )
}

type FocusTrapKeyEvent = Pick<KeyboardEvent, "key" | "shiftKey">

export function handleMobileDrawerFocusTrapKeyDown(
  event: FocusTrapKeyEvent,
  drawer: HTMLElement,
  activeElement: Element | null,
  onClose: () => void,
) {
  if (event.key === "Escape") {
    onClose()
    return true
  }

  if (event.key !== "Tab") {
    return false
  }

  const elements = getFocusableElements(drawer)
  if (elements.length === 0) {
    return true
  }

  const currentIndex = activeElement instanceof HTMLElement ? elements.indexOf(activeElement) : -1
  const nextIndex =
    currentIndex === -1
      ? 0
      : event.shiftKey
        ? (currentIndex - 1 + elements.length) % elements.length
        : (currentIndex + 1) % elements.length

  elements[nextIndex]?.focus()
  return true
}
