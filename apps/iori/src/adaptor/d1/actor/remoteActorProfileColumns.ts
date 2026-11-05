import z from 'zod/v4';

import type { RemoteActor, RemoteActorProfile } from '../../../domain/actor/remoteActor.ts';
import type { remoteActorsTable } from '../schema.ts';

type RemoteActorRow = typeof remoteActorsTable.$inferSelect;

const fieldsSchema = z.array(z.object({ name: z.string(), value: z.string() }));
const emojisSchema = z.array(z.object({ shortcode: z.string(), url: z.string() }));
const actorTypeSchema = z.enum(['Person', 'Service', 'Application', 'Group', 'Organization']);

const parseJsonArray = <T>(schema: z.ZodType<T[]>, json: string | null): T[] | undefined => {
  if (json === null) return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(json));
    return parsed.success && parsed.data.length > 0 ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const toRemoteActorProfileFields = (
  row: Pick<
    RemoteActorRow,
    | 'displayName'
    | 'summary'
    | 'headerUri'
    | 'actorType'
    | 'manuallyApprovesFollowers'
    | 'publishedAt'
    | 'fields'
    | 'emojis'
  >,
): Pick<
  RemoteActor,
  | 'displayName'
  | 'summary'
  | 'headerUri'
  | 'actorType'
  | 'manuallyApprovesFollowers'
  | 'publishedAt'
  | 'fields'
  | 'emojis'
> => {
  const actorType = actorTypeSchema.safeParse(row.actorType);
  return {
    displayName: row.displayName ?? undefined,
    summary: row.summary ?? undefined,
    headerUri: row.headerUri ?? undefined,
    actorType: actorType.success ? actorType.data : undefined,
    manuallyApprovesFollowers: row.manuallyApprovesFollowers ?? undefined,
    publishedAt: row.publishedAt?.getTime(),
    fields: parseJsonArray(fieldsSchema, row.fields),
    emojis: parseJsonArray(emojisSchema, row.emojis),
  };
};

const jsonOrNull = <T>(items: ReadonlyArray<T> | undefined): string | null | undefined =>
  items === undefined ? undefined : items.length > 0 ? JSON.stringify(items) : null;

export const toRemoteActorProfileColumns = (profile: RemoteActorProfile) => ({
  displayName: profile.displayName,
  summary: profile.summary,
  headerUri: profile.headerUri,
  actorType: profile.actorType,
  manuallyApprovesFollowers: profile.manuallyApprovesFollowers,
  publishedAt: profile.publishedAt === undefined
    ? undefined
    : profile.publishedAt === null
    ? null
    : new Date(profile.publishedAt),
  fields: jsonOrNull(profile.fields),
  emojis: jsonOrNull(profile.emojis),
});
