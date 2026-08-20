import { FeedViewType } from "@follow-app/client-sdk"
import { useMutation } from "@tanstack/react-query"
import type { FormEvent } from "react"

import { Page } from "../../app/Page"
import { queryKeys } from "../../domain/query-keys"
import { followApi } from "../../infrastructure/api"
import { queryClient } from "../../infrastructure/query-client"

export function Component() {
  const mutation = useMutation({
    mutationFn: (url: string) =>
      followApi.subscriptions.create({
        category: null,
        isPrivate: false,
        title: null,
        type: "feed",
        url,
        view: FeedViewType.Articles,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.root() }),
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    mutation.mutate(String(new FormData(event.currentTarget).get("url")))
  }

  return (
    <Page title="Discover">
      <p className="mt-2 text-sm text-text-secondary">Follow a website or feed by URL.</p>
      <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="feed-url">
          Website or feed URL
        </label>
        <input
          required
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-fill-tertiary bg-fill-quinary px-4 text-base outline-none focus:border-accent"
          id="feed-url"
          inputMode="url"
          name="url"
          placeholder="https://example.com/feed.xml"
          type="url"
        />
        <button
          className="min-h-12 rounded-xl bg-accent px-5 font-semibold text-white disabled:opacity-50"
          disabled={mutation.isPending}
          type="submit"
        >
          {mutation.isPending ? "Following…" : "Follow"}
        </button>
      </form>
      {mutation.isSuccess && (
        <p aria-live="polite" className="mt-4 text-sm text-green">
          Added to your subscriptions.
        </p>
      )}
      {mutation.isError && (
        <p aria-live="polite" className="mt-4 text-sm text-red">
          Unable to follow this URL.
        </p>
      )}
    </Page>
  )
}
