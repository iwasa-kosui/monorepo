import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { Post } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { TimelineItem } from '../../../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../../../domain/timeline/timelineItemId.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1PostDeletedStore } from '../post/postDeletedStore.ts';
import {
  domainEventsTable,
  localPostsTable,
  postImagesTable,
  postsTable,
  remotePostsTable,
  timelineItemsTable,
} from '../schema.ts';
import { createD1TimelineItemDeletedStore } from '../timeline/timelineItemDeletedStore.ts';

type Operation = Readonly<{
  kind: 'delete' | 'insert' | 'update';
  table: string;
  values?: unknown;
}>;

const createRecordingDb = () => {
  const operations: Operation[] = [];
  const tableNames = new Map<unknown, string>([
    [domainEventsTable, 'domain_events'],
    [localPostsTable, 'local_posts'],
    [postImagesTable, 'post_images'],
    [postsTable, 'posts'],
    [remotePostsTable, 'remote_posts'],
    [timelineItemsTable, 'timeline_items'],
  ]);
  const tableName = (table: unknown): string => tableNames.get(table) ?? 'unknown';
  const db = {
    batch: async () => [],
    delete: (table: unknown) => ({
      where: () => {
        const operation = { kind: 'delete', table: tableName(table) } as const;
        operations.push(operation);
        return operation;
      },
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        const operation = { kind: 'insert', table: tableName(table), values } as const;
        operations.push(operation);
        return operation;
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: () => {
          const operation = { kind: 'update', table: tableName(table), values } as const;
          operations.push(operation);
          return operation;
        },
      }),
    }),
  } as unknown as IoriD1Db;
  return { db, operations } as const;
};

describe('D1 post deletion stores', () => {
  it('deletes aggregate children before the post and stores a scalar aggregate ID', async () => {
    const { db, operations } = createRecordingDb();
    const postId = PostId.generate();
    const now = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));

    await createD1PostDeletedStore(db).store(Post.deletePost(now)(postId));

    expect(operations.map(({ kind, table }) => `${kind}:${table}`)).toEqual([
      'delete:post_images',
      'delete:local_posts',
      'delete:remote_posts',
      'delete:posts',
      'insert:domain_events',
    ]);
    expect(operations.at(-1)?.values).toMatchObject({ aggregateId: postId });
  });

  it('soft-deletes timeline rows like the Node store', async () => {
    const { db, operations } = createRecordingDb();
    const now = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));

    await createD1TimelineItemDeletedStore(db).store(
      TimelineItem.deleteTimelineItem(TimelineItemId.generate(), now),
    );

    expect(operations[0]).toMatchObject({
      kind: 'update',
      table: 'timeline_items',
      values: { deletedAt: new Date(now) },
    });
    expect(operations.some(({ kind, table }) => kind === 'delete' && table === 'timeline_items')).toBe(false);
  });
});
