import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray } from 'drizzle-orm';
import z from 'zod/v4';

import { Instant } from '../../../domain/instant/instant.ts';
import type { PostVersion, PostVersionsResolverByPostId } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { domainEventsTable } from '../schema.ts';

const createdStateSchema = z.object({
  content: z.string(),
  summary: z.string().nullable(),
  sensitive: z.boolean(),
  createdAt: Instant.zodType,
});

const updatedPayloadSchema = z.object({
  content: z.string(),
  summary: z.string().nullable(),
  sensitive: z.boolean(),
  editedAt: Instant.zodType,
});

export const createD1PostVersionsResolverByPostId = (db: IoriD1Db): PostVersionsResolverByPostId => ({
  resolve: (postId) =>
    RA.flow(
      fromD1(async (): Promise<ReadonlyArray<PostVersion>> => {
        const rows = await db.select({
          eventName: domainEventsTable.eventName,
          aggregateState: domainEventsTable.aggregateState,
          eventPayload: domainEventsTable.eventPayload,
        }).from(domainEventsTable).where(and(
          eq(domainEventsTable.aggregateId, postId),
          inArray(domainEventsTable.eventName, ['post.created', 'post.updated']),
        ));
        const created = rows.find((row) => row.eventName === 'post.created');
        if (created?.aggregateState == null) {
          return [];
        }
        const first = createdStateSchema.parse(JSON.parse(created.aggregateState));
        const edits = rows
          .filter((row) => row.eventName === 'post.updated' && row.eventPayload !== null)
          .map((row) => updatedPayloadSchema.parse(JSON.parse(row.eventPayload ?? 'null')))
          .sort((a, b) => a.editedAt - b.editedAt);
        return [
          first,
          ...edits.map(({ editedAt, ...rest }) => ({ ...rest, createdAt: editedAt })),
        ];
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
