import type { ExternalArticleMeta } from './external-articles/index.ts';
import { getExternalArticles } from './external-articles/index.ts';
import type { PostMeta } from './posts/index.ts';
import { getPosts } from './posts/index.ts';
import type { TalkMeta } from './talks/index.ts';
import { getTalks } from './talks/index.ts';

export type TimelineItem =
  | { kind: 'post'; date: string; data: PostMeta }
  | { kind: 'talk'; date: string; data: TalkMeta }
  | { kind: 'external-article'; date: string; data: ExternalArticleMeta };

export const getTimeline = (): TimelineItem[] => {
  const items: TimelineItem[] = [
    ...getPosts().map((post): TimelineItem => ({ kind: 'post', date: post.date, data: post })),
    ...getTalks().map((talk): TimelineItem => ({ kind: 'talk', date: talk.date, data: talk })),
    ...getExternalArticles().map(
      (article): TimelineItem => ({ kind: 'external-article', date: article.date, data: article }),
    ),
  ];

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};
