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
  summary: z.string().nullish().transform((summary) => summary ?? null),
  sensitive: z.boolean().default(false),
  createdAt: Instant.zodType,
});

const updatedPayloadSchema = z.object({
  content: z.string(),
  summary: z.string().nullable(),
  sensitive: z.boolean(),
  editedAt: Instant.zodType,
});

const parseJson = <S extends z.ZodType>(schema: S, json: string | null): z.output<S> | undefined => {
  if (json === null) {
    return undefined;
  }
  try {
    const parsed = schema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

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
        const first = rows
          .filter((row) => row.eventName === 'post.created')
          .map((row) => parseJson(createdStateSchema, row.aggregateState))
          .find((version) => version !== undefined);
        const edits = rows
          .filter((row) => row.eventName === 'post.updated')
          .map((row) => parseJson(updatedPayloadSchema, row.eventPayload))
          .filter((edit) => edit !== undefined)
          .sort((a, b) => a.editedAt - b.editedAt);
        return [
          ...(first === undefined ? [] : [first]),
          ...edits.map(({ editedAt, ...rest }) => ({ ...rest, createdAt: editedAt })),
        ];
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
