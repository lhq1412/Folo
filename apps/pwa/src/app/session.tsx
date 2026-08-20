import { useEffect } from "react"
import { Navigate, Outlet } from "react-router"

import { authClient } from "../infrastructure/auth"
import { useOnlineStatus } from "../infrastructure/online"
import {
  clearSessionSnapshot,
  readSessionSnapshot,
  writeSessionSnapshot,
} from "../infrastructure/session-snapshot"
import { LoadingScreen } from "./loading-screen"
import { LiteSessionProvider } from "./session-context"

export function SessionBoundary() {
  const { data: session, error, isPending } = authClient.useSession()
  const online = useOnlineStatus()

  useEffect(() => {
    if (!session?.user) return
    writeSessionSnapshot({
      email: session.user.email ?? "",
      name: session.user.name ?? "",
      userId: session.user.id,
    })
  }, [session])

  const snapshot = readSessionSnapshot()
  const liveUser = session?.user
    ? {
        email: session.user.email ?? "",
        id: session.user.id,
        name: session.user.name ?? "",
      }
    : null
  const snapshotUser =
    snapshot && (isPending || Boolean(error) || !online)
      ? { email: snapshot.email, id: snapshot.userId, name: snapshot.name }
      : null
  const user = liveUser ?? snapshotUser

  if (isPending && !user) {
    return <LoadingScreen />
  }

  if (error && !user) {
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

  if (!isPending && !error && !session?.user) {
    clearSessionSnapshot()
    return <Navigate replace to="/login" />
  }

  if (!user) {
    return <Navigate replace to="/login" />
  }

  return (
    <LiteSessionProvider value={{ isOffline: !online, isSnapshot: !liveUser, user }}>
      <Outlet />
    </LiteSessionProvider>
  )
}
