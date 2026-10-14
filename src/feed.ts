import type { FeedItem } from "./model"

export function pushFeed(feed: FeedItem[], item: FeedItem, limit = 20): FeedItem[] {
  const without = feed.filter((f) => f.id !== item.id)
  return [item, ...without].slice(0, limit)
}
