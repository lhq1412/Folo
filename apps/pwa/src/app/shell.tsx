import { useEffect } from "react"
import { NavLink, Outlet, useLocation } from "react-router"

const tabs = [
  { to: "/", label: "Home", icon: "home-5" },
  { to: "/subscriptions", label: "Subscriptions", icon: "black-board-2" },
  { to: "/discover", label: "Discover", icon: "search-3" },
  { to: "/settings", label: "Settings", icon: "settings-1" },
] as const

export function AppShell() {
  const location = useLocation()
  const isEntryDetail = location.pathname.startsWith("/entries/")

  useEffect(() => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("#main h1")?.focus()
    })
  }, [location.pathname, location.search])

  return (
    <div className="app-shell bg-theme-background font-theme text-text">
      <a
        className="fixed left-2 top-2 z-[100] -translate-y-20 rounded-lg bg-accent px-3 py-2 text-sm text-white focus:translate-y-0"
        href="#main"
      >
        Skip to content
      </a>
      <main id="main" className="min-h-0 overflow-hidden" tabIndex={-1}>
        <Outlet />
      </main>
      {!isEntryDetail && (
        <nav
          aria-label="Primary"
          className="border-t border-fill-tertiary bg-material-thick px-[var(--safe-left)] pb-[var(--safe-bottom)]"
        >
          <ul className="mx-auto grid h-16 max-w-xl grid-cols-4">
            {tabs.map((tab) => (
              <li key={tab.to}>
                <NavLink
                  end={tab.to === "/"}
                  className={({ isActive }) =>
                    `flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${isActive ? "text-accent" : "text-text-tertiary"}`
                  }
                  to={tab.to}
                >
                  {({ isActive }) => (
                    <>
                      <i
                        aria-hidden
                        className={`i-mgc-${tab.icon}-cute-${isActive ? "fi" : "re"} size-5`}
                      />
                      <span>{tab.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
