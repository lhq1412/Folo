import { useRouteError } from "react-router"

export function RouteError() {
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
