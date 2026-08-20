import { createBrowserRouter, Navigate } from "react-router"

import { LoadingScreen } from "./loading-screen"
import { RouteError } from "./route-error"
import { SessionBoundary } from "./session"
import { AppShell } from "./shell"

export const router = createBrowserRouter([
  {
    path: "/login",
    lazy: () => import("../features/auth/LoginPage"),
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
          {
            lazy: () => import("../features/timeline/TimelinePage"),
            children: [
              { index: true },
              {
                path: "entries/:entryId",
                lazy: () => import("../features/reader/ReaderPage"),
              },
            ],
          },
          {
            path: "subscriptions",
            lazy: () => import("../features/subscriptions/SubscriptionsPage"),
          },
          { path: "discover", lazy: () => import("../features/subscriptions/DiscoverPage") },
          { path: "settings", lazy: () => import("../features/settings/SettingsPage") },
          { path: "*", element: <Navigate replace to="/" /> },
        ],
      },
    ],
  },
])
