import { useMutation } from "@tanstack/react-query"

import { Page } from "../../app/Page"
import { authClient } from "../../infrastructure/auth"
import { queryClient } from "../../infrastructure/query-client"

export function Component() {
  const { data: session } = authClient.useSession()
  const signOut = useMutation({
    mutationFn: async () => {
      const result = await authClient.signOut()
      if (result.error) throw new Error(result.error.message ?? "Unable to sign out.")
    },
    onSuccess: () => {
      queryClient.clear()
      window.location.assign("/login")
    },
  })

  return (
    <Page title="Settings">
      <div className="mt-6 rounded-2xl bg-fill-quinary p-4">
        <p className="font-medium">{session?.user.name || "Folo user"}</p>
        <p className="mt-0.5 text-sm text-text-secondary">{session?.user.email}</p>
      </div>
      <button
        className="mt-6 min-h-12 w-full rounded-xl border border-red/30 px-4 font-medium text-red disabled:opacity-50"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
        type="button"
      >
        {signOut.isPending ? "Signing out…" : "Sign out"}
      </button>
      {signOut.isError && (
        <p aria-live="polite" className="mt-3 text-sm text-red">
          Unable to sign out.
        </p>
      )}
    </Page>
  )
}
