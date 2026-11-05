import z from 'zod/v4';

import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { ActorId } from './actorId.ts';
import { ActorEvent } from './aggregate.ts';

const actorTypeZodType = z.enum(['Person', 'Service', 'Application', 'Group', 'Organization']);
const profileFieldZodType = z.object({ name: z.string(), value: z.string() });
const profileEmojiZodType = z.object({ shortcode: z.string(), url: z.string() });

const zodType = z.object({
  id: ActorId.zodType,
  uri: z.string(),
  inboxUrl: z.string(),
  type: z.literal('remote'),
  username: z.string().optional(),
  url: z.string().optional(),
  logoUri: z.string().optional(),
  displayName: z.string().optional(),
  summary: z.string().optional(),
  headerUri: z.string().optional(),
  actorType: actorTypeZodType.optional(),
  manuallyApprovesFollowers: z.boolean().optional(),
  publishedAt: z.number().optional(),
  fields: z.array(profileFieldZodType).optional(),
  emojis: z.array(profileEmojiZodType).optional(),
}).describe('RemoteActor');

export type RemoteActorType = z.output<typeof actorTypeZodType>;
export type RemoteActorProfileField = z.output<typeof profileFieldZodType>;
export type RemoteActorProfileEmoji = z.output<typeof profileEmojiZodType>;

export type RemoteActorProfile = Readonly<{
  displayName?: string | null;
  summary?: string | null;
  headerUri?: string | null;
  actorType?: RemoteActorType | null;
  manuallyApprovesFollowers?: boolean | null;
  publishedAt?: number | null;
  fields?: ReadonlyArray<RemoteActorProfileField>;
  emojis?: ReadonlyArray<RemoteActorProfileEmoji>;
}>;

export type RemoteActor = z.output<typeof zodType>;
export type RemoteActorCreated = ActorEvent<RemoteActor, 'actor.created', Record<never, never>>;
export type RemoteActorCreatedStore = Agg.Store<RemoteActorCreated>;

const applyProfile = (profile: RemoteActorProfile): Partial<RemoteActor> => ({
  ...(profile.displayName !== undefined && { displayName: profile.displayName ?? undefined }),
  ...(profile.summary !== undefined && { summary: profile.summary ?? undefined }),
  ...(profile.headerUri !== undefined && { headerUri: profile.headerUri ?? undefined }),
  ...(profile.actorType !== undefined && { actorType: profile.actorType ?? undefined }),
  ...(profile.manuallyApprovesFollowers !== undefined
    && { manuallyApprovesFollowers: profile.manuallyApprovesFollowers ?? undefined }),
  ...(profile.publishedAt !== undefined && { publishedAt: profile.publishedAt ?? undefined }),
  ...(profile.fields !== undefined && { fields: profile.fields.length > 0 ? [...profile.fields] : undefined }),
  ...(profile.emojis !== undefined && { emojis: profile.emojis.length > 0 ? [...profile.emojis] : undefined }),
});

const isProfileChanged = (actor: RemoteActor, profile: RemoteActorProfile): boolean => {
  const next = applyProfile(profile);
  return (Object.keys(next) as Array<keyof RemoteActor>).some((key) =>
    JSON.stringify(next[key] ?? null) !== JSON.stringify(actor[key] ?? null)
  );
};

type CreateProps = Readonly<{
  uri: string;
  inboxUrl: string;
  url?: string;
  username?: string;
  logoUri?: string;
  profile?: RemoteActorProfile;
}>;
const createRemoteActor = ({ uri, inboxUrl, url, username, logoUri, profile }: CreateProps): RemoteActorCreated => {
  const remoteActor: RemoteActor = {
    id: ActorId.generate(),
    uri,
    inboxUrl,
    url,
    username,
    type: 'remote' as const,
    logoUri,
    ...(profile ? applyProfile(profile) : {}),
  };
  return ActorEvent.create(
    remoteActor.id,
    remoteActor,
    'actor.created',
    {},
    Instant.now(),
  );
};

const getHandle = (remoteActor: RemoteActor): string | undefined => {
  const { username, url } = remoteActor;
  if (!username || !url) {
    return undefined;
  }
  const parsedUrl = new URL(url);
  return `${username}@${parsedUrl.host}`;
};

export const RemoteActor = {
  zodType,
  createRemoteActor,
  applyProfile,
  isProfileChanged,
  getHandle,
} as const;
