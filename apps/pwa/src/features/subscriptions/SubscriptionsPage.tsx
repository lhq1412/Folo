import { useQuery } from "@tanstack/react-query"

import { Page } from "../../app/Page"
import { subscriptionInfo } from "./model"
import { subscriptionsQueryOptions } from "./queries"

export function Component() {
  const query = useQuery(subscriptionsQueryOptions())

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
