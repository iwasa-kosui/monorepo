import {
  BlueskyTimelineEmbed,
  BlueskyTimelineFacets,
  BlueskyTimelineItem,
} from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type { blueskyTimelineItemsTable } from '../schema.ts';

type Row = typeof blueskyTimelineItemsTable.$inferSelect;

export const toBlueskyTimelineItemRow = (item: BlueskyTimelineItem): typeof blueskyTimelineItemsTable.$inferInsert => ({
  ...item,
  facets: JSON.stringify(item.facets),
  embed: item.embed === null ? null : JSON.stringify(item.embed),
  postedAt: new Date(item.postedAt),
  indexedAt: new Date(item.indexedAt),
  fetchedAt: new Date(item.fetchedAt),
});

export const toBlueskyTimelineItem = (row: Row): BlueskyTimelineItem =>
  BlueskyTimelineItem.orThrow({
    ...row,
    facets: BlueskyTimelineFacets.parseOrThrow(JSON.parse(row.facets)),
    embed: row.embed === null ? null : BlueskyTimelineEmbed.parseOrThrow(JSON.parse(row.embed)),
    postedAt: row.postedAt.getTime() as Instant,
    indexedAt: row.indexedAt.getTime() as Instant,
    fetchedAt: row.fetchedAt.getTime() as Instant,
  });
