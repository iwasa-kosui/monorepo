import z from 'zod/v4';

import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { FeedEntryId } from './feedEntryId.ts';

const zodType = z
  .object({
    feedEntryId: FeedEntryId.zodType,
    sourceTitle: z.string().min(1),
    text: z.string(),
    url: z.string().min(1),
    postedAt: Instant.zodType,
  })
  .describe('XFeedEntry');
export type XFeedEntry = z.output<typeof zodType>;

export type XFeedEntriesResolver = Agg.Resolver<{ limit: number; now: Instant }, ReadonlyArray<XFeedEntry>>;

export const XFeedEntry = { zodType } as const;
