import type { RA } from '@iwasa-kosui/result';

import type { BlueskyBookmark, BlueskyViewerBookmarksSyncedStore } from '../domain/blueskyTimeline/blueskyBookmark.ts';
import type { BlueskyBookmarkReader, BlueskyBookmarksPage } from '../ports/blueskyBookmarkReader.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ cursor: string | undefined }>;

export type ListBlueskyBookmarksUseCase = UseCase<Input, BlueskyBookmarksPage, BlueskyClientError>;

type Deps = Readonly<{ reader: BlueskyBookmarkReader; viewerBookmarksStore: BlueskyViewerBookmarksSyncedStore }>;

const create = ({ reader, viewerBookmarksStore }: Deps): ListBlueskyBookmarksUseCase => {
  const run = async (input: Input): RA<BlueskyBookmarksPage, BlueskyClientError> => {
    const page = await reader.getBookmarks(input);
    if (!page.ok) return page;
    const bookmarks = new Map<string, BlueskyBookmark>();
    for (const item of page.val.items) {
      if (!bookmarks.has(item.uri)) bookmarks.set(item.uri, { subjectUri: item.uri, createdAt: item.fetchedAt });
    }
    await viewerBookmarksStore.sync([...bookmarks.values()]).catch(() => undefined);
    return page;
  };

  return { run };
};

export const ListBlueskyBookmarksUseCase = {
  create,
} as const;
