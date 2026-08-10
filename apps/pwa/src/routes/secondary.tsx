import type {
  InboxSubscriptionResponse,
  ListSubscriptionResponse,
  SubscriptionWithFeed,
} from "@follow-app/client-sdk"
import { FeedViewType } from "@follow-app/client-sdk"
import { useMutation, useQuery } from "@tanstack/react-query"
import type { FormEvent } from "react"

import { followApi } from "../lib/api"
import { authClient } from "../lib/auth"
import { queryClient } from "../lib/query-client"

type Subscription = SubscriptionWithFeed | ListSubscriptionResponse | InboxSubscriptionResponse

const subscriptionInfo = (item: Subscription) => {
  if ("feeds" in item) {
    return {
      id: item.feedId,
      image: item.feeds.image,
      title: item.title || item.feeds.title || item.feeds.url,
    }
  }
  if ("lists" in item) {
    return {
      id: item.listId,
      image: item.lists.image,
      title: item.title || item.lists.title || "List",
    }
  }
  return { id: item.inboxId, image: undefined, title: item.title || item.inboxes.title || "Inbox" }
}

function Page({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="h-full overflow-y-auto px-5 py-5">
      <div className="mx-auto max-w-xl">
        <h1 className="text-title1 font-semibold tracking-tight outline-none" tabIndex={-1}>
          {title}
        </h1>
        {children}
      </div>
    </section>
  )
}

export function SubscriptionsPage() {
  const query = useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => (await followApi.subscriptions.get({})).data,
  })

  return (
    <Page title="Subscriptions">
      <p className="mt-2 text-sm text-text-secondary">Feeds, lists, and inboxes you follow.</p>
      {query.isPending && (
        <p className="mt-6 text-sm text-text-secondary">Loading subscriptions…</p>
      )}
      {query.isError && (
        <button className="mt-6 min-h-11 text-sm text-accent" onClick={() => void query.refetch()}>
          Unable to load. Try again
        </button>
      )}
      <ul className="mt-5 divide-y divide-fill-tertiary">
        {query.data?.map((item) => {
          const info = subscriptionInfo(item)
          return (
            <li className="flex min-h-14 items-center gap-3 py-2" key={`${item.userId}:${info.id}`}>
              {info.image ? (
                <img alt="" className="size-8 rounded-lg" loading="lazy" src={info.image} />
              ) : (
                <span
                  aria-hidden
                  className="grid size-8 place-items-center rounded-lg bg-fill-quinary"
                >
                  <i className="i-mgc-rss-2-cute-re size-4" />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{info.title}</span>
              {item.category && <span className="text-xs text-text-tertiary">{item.category}</span>}
            </li>
          )
        })}
      </ul>
      {!query.isPending && query.data?.length === 0 && (
        <p className="mt-6 text-sm text-text-secondary">You are not following anything yet.</p>
      )}
    </Page>
  )
}

export function DiscoverPage() {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
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

export function SettingsPage() {
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
