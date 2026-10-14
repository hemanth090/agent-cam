import type { FeedItem } from "./model"
import { FEED_LIMIT } from "./config"

export function pushFeed(feed: FeedItem[], item: FeedItem, limit = FEED_LIMIT): FeedItem[] {
  const without = feed.filter((f) => f.id !== item.id)
  return [item, ...without].slice(0, limit)
}
