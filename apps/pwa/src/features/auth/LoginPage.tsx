import type { FormEvent } from "react"
import { useState } from "react"
import { Navigate, useNavigate } from "react-router"

import { authClient } from "../../infrastructure/auth"
import { queryClient } from "../../infrastructure/query-client"
import { queryPersistence } from "../../infrastructure/query-persistence"
import { clearSessionSnapshot } from "../../infrastructure/session-snapshot"

export function Component() {
  const navigate = useNavigate()
  const { data: session, isPending, refetch } = authClient.useSession()
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  if (!isPending && session?.user) {
    return <Navigate replace to="/" />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    setSubmitting(true)

    const form = new FormData(event.currentTarget)
    try {
      const result = await authClient.signIn.email({
        email: String(form.get("email")),
        password: String(form.get("password")),
      })

      if (result.error) {
        setError(result.error.message ?? "Unable to sign in.")
        return
      }

      queryClient.clear()
      await queryPersistence.clear()
      clearSessionSnapshot()
      await refetch()
      navigate("/", { replace: true })
    } catch {
      setError("Unable to connect. Check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-[var(--app-height)] place-items-center bg-theme-background px-5 py-[calc(2rem+var(--safe-top))] text-text">
      <section className="w-full max-w-sm">
        <img alt="" className="size-14 rounded-2xl" src="/icon.svg" />
        <h1 className="mt-6 text-largeTitle font-semibold tracking-tight">Welcome to Folo</h1>
        <p className="mt-2 text-body text-text-secondary">Sign in to read your timeline.</p>

        <form className="mt-8 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Email</span>
            <input
              required
              autoCapitalize="none"
              autoComplete="email"
              className="min-h-12 w-full rounded-xl border border-fill-tertiary bg-fill-quinary px-4 text-base outline-none transition-colors focus:border-accent"
              inputMode="email"
              name="email"
              type="email"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Password</span>
            <input
              required
              autoComplete="current-password"
              className="min-h-12 w-full rounded-xl border border-fill-tertiary bg-fill-quinary px-4 text-base outline-none transition-colors focus:border-accent"
              minLength={8}
              name="password"
              type="password"
            />
          </label>
          {error && (
            <p aria-live="polite" className="text-sm text-red">
              {error}
            </p>
          )}
          <button
            className="min-h-12 w-full rounded-xl bg-accent px-4 font-semibold text-white disabled:opacity-50"
            disabled={submitting || isPending}
            type="submit"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  )
}
