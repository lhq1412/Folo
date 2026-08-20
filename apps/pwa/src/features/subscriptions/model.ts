import type {
  InboxSubscriptionResponse,
  ListSubscriptionResponse,
  SubscriptionWithFeed,
} from "@follow-app/client-sdk"

export type Subscription =
  SubscriptionWithFeed | ListSubscriptionResponse | InboxSubscriptionResponse

export const subscriptionInfo = (item: Subscription) => {
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
