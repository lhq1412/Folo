import { Navigate, Outlet } from "react-router"

import { authClient } from "../infrastructure/auth"
import { LoadingScreen } from "./loading-screen"

export function SessionBoundary() {
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
