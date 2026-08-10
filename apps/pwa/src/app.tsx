import { useEffect } from "react"
import {
  createBrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useRouteError,
} from "react-router"
import { useRegisterSW } from "virtual:pwa-register/react"

import { authClient } from "./lib/auth"

const tabs = [
  { to: "/", label: "Home", icon: "home-5" },
  { to: "/subscriptions", label: "Subscriptions", icon: "black-board-2" },
  { to: "/discover", label: "Discover", icon: "search-3" },
  { to: "/settings", label: "Settings", icon: "settings-1" },
] as const

function SessionBoundary() {
  const { data: session, error, isPending } = authClient.useSession()

  if (isPending) {
    return <LoadingScreen />
  }

  if (error) {
    return (
      <main className="grid h-[var(--app-height)] place-items-center bg-theme-background p-6 text-center text-text">
        <div>
          <h1 className="text-title2 font-semibold">Folo cannot reach your account</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Check your connection or API origin configuration.
          </p>
          <button
            className="mt-5 min-h-11 rounded-xl border border-fill-tertiary px-5 text-sm font-medium"
            type="button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      </main>
    )
  }

  if (!session?.user) {
    return <Navigate replace to="/login" />
  }

  return <Outlet />
}

function LoadingScreen() {
  return (
    <main className="grid h-[var(--app-height)] place-items-center bg-theme-background text-text">
      <p aria-live="polite" className="text-sm text-text-secondary">
        Loading Folo…
      </p>
    </main>
  )
}

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <aside
      aria-label="App update"
      className="fixed bottom-[calc(4.5rem+var(--safe-bottom))] left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-fill-tertiary bg-material-thick p-3 shadow-xl"
    >
      <p className="min-w-0 flex-1 text-sm">A new version is ready.</p>
      <button
        className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white"
        type="button"
        onClick={() => void updateServiceWorker(true)}
      >
        Update
      </button>
      <button
        aria-label="Dismiss update"
        className="min-h-11 min-w-11 rounded-xl text-text-secondary"
        type="button"
        onClick={() => setNeedRefresh(false)}
      >
        Later
      </button>
    </aside>
  )
}

function AppShell() {
  const location = useLocation()

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
    </div>
  )
}

function RouteError() {
  const error = useRouteError()
  const message = error instanceof Error ? error.message : "Something went wrong."

  return (
    <main className="grid h-[var(--app-height)] place-items-center bg-theme-background p-6 text-center text-text">
      <div>
        <h1 className="text-title1 font-semibold">Folo could not open this page</h1>
        <p className="mt-2 text-sm text-text-secondary">{message}</p>
        <a className="mt-5 inline-flex min-h-11 items-center text-accent" href="/">
          Return home
        </a>
      </div>
    </main>
  )
}

export const router = createBrowserRouter([
  {
    path: "/login",
    lazy: () => import("./routes/login"),
    hydrateFallbackElement: <LoadingScreen />,
    errorElement: <RouteError />,
  },
  {
    element: <SessionBoundary />,
    hydrateFallbackElement: <LoadingScreen />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, lazy: () => import("./routes/timeline") },
          { path: "entries/:entryId", lazy: () => import("./routes/timeline") },
          {
            path: "subscriptions",
            lazy: async () => ({
              Component: (await import("./routes/secondary")).SubscriptionsPage,
            }),
          },
          {
            path: "discover",
            lazy: async () => ({
              Component: (await import("./routes/secondary")).DiscoverPage,
            }),
          },
          {
            path: "settings",
            lazy: async () => ({
              Component: (await import("./routes/secondary")).SettingsPage,
            }),
          },
          { path: "*", element: <Navigate replace to="/" /> },
        ],
      },
    ],
  },
])
