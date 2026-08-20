// @vitest-environment jsdom

import { describe, expect, test } from "vitest"

import { router } from "./router"

const visit = (
  routes: typeof router.routes,
  visitRoute: (route: (typeof router.routes)[number]) => void,
) => {
  for (const route of routes) {
    visitRoute(route)
    if (route.children) visit(route.children, visitRoute)
  }
}

describe("app router", () => {
  test("keeps the timeline layout mounted for list and reader routes", () => {
    let timelineLayout: (typeof router.routes)[number] | undefined
    visit(router.routes, (route) => {
      if (route.children?.some((child) => child.path === "entries/:entryId")) {
        timelineLayout = route
      }
    })

    expect(timelineLayout?.lazy).toBeTypeOf("function")
    expect(timelineLayout?.children?.some((child) => child.index)).toBe(true)
    expect(timelineLayout?.path).toBeUndefined()
  })
})
