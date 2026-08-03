import type { Locator } from "@playwright/test"

type ReactElement = HTMLElement & Record<string, unknown>

/**
 * Radix TooltipTrigger merges handlers onto the child button in a way that can
 * leave native Playwright clicks disconnected from React's onClick in dev/E2E.
 */
export const clickReactElement = async (locator: Locator) => {
  await locator.evaluate((element: ReactElement) => {
    const propsKey = Object.keys(element).find((key) => key.startsWith("__reactProps"))
    const onClick = propsKey
      ? (element[propsKey] as { onClick?: (event: unknown) => void })?.onClick
      : null

    if (!onClick) {
      element.click()
      return
    }

    onClick({
      preventDefault: () => {},
      stopPropagation: () => {},
      currentTarget: element,
      target: element,
    })
  })
}
