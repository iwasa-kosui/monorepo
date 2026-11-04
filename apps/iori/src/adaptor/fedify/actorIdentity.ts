import {
  type Actor,
  Application,
  Emoji,
  Group,
  type Link,
  Organization,
  Person,
  PropertyValue,
  Service,
} from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';

import type {
  RemoteActorProfile,
  RemoteActorProfileEmoji,
  RemoteActorProfileField,
  RemoteActorType,
} from '../../domain/actor/remoteActor.ts';

export const PROFILE_LIMITS = {
  displayName: 200,
  summary: 10_000,
  fields: 16,
  emojis: 50,
  fieldName: 255,
  fieldValue: 2048,
  emojiUrl: 2048,
} as const;

const EMOJI_SHORTCODE_PATTERN = /^[A-Za-z0-9_+-]{2,}$/;

export type ActorIdentity = Readonly<{
  uri: string;
  inboxUrl: string;
  url: string | undefined;
  username: string | undefined;
  logoUri?: string | undefined;
  profile?: RemoteActorProfile;
}>;

export type ParseActorIdentityError = Readonly<{
  type: 'ParseActorIdentityError';
  message: string;
}>;

export const ParseActorIdentityError = {
  create: (message: string): ParseActorIdentityError => ({
    type: 'ParseActorIdentityError',
    message,
  }),
} as const;

export type FromFedifyActorOptions = Readonly<{
  documentLoader?: DocumentLoader;
}>;

const toActorType = (actor: Actor): RemoteActorType | null => {
  if (actor instanceof Person) return 'Person';
  if (actor instanceof Service) return 'Service';
  if (actor instanceof Application) return 'Application';
  if (actor instanceof Group) return 'Group';
  if (actor instanceof Organization) return 'Organization';
  return null;
};

const toHref = (url: URL | Link | null | undefined): string | undefined =>
  url instanceof URL ? url.href : url?.href?.href;

const toText = (value: unknown): string | null => {
  const text = value === null || value === undefined ? '' : value.toString();
  return text === '' ? null : text;
};

const truncate = (value: string | null, limit: number): string | null =>
  value === null ? null : Array.from(value).slice(0, limit).join('');

const collect = async <T>(source: AsyncIterable<T>, accept: (item: T) => boolean, limit: number): Promise<T[]> => {
  const items: T[] = [];
  for await (const item of source) {
    if (!accept(item)) continue;
    items.push(item);
    if (items.length >= limit) break;
  }
  return items;
};

const readFields = async (
  actor: Actor,
  options: FromFedifyActorOptions | undefined,
): Promise<RemoteActorProfileField[] | undefined> => {
  try {
    const attachments = await collect(
      actor.getAttachments(options),
      (item) => item instanceof PropertyValue,
      PROFILE_LIMITS.fields,
    );
    return (attachments as PropertyValue[]).flatMap((property): RemoteActorProfileField[] => {
      const name = toText(property.name);
      return name === null ? [] : [{
        name: truncate(name, PROFILE_LIMITS.fieldName) ?? '',
        value: truncate(toText(property.value), PROFILE_LIMITS.fieldValue) ?? '',
      }];
    });
  } catch {
    return undefined;
  }
};

const readEmojis = async (
  actor: Actor,
  options: FromFedifyActorOptions | undefined,
): Promise<RemoteActorProfileEmoji[] | undefined> => {
  try {
    const tags = await collect(actor.getTags(options), (item) => item instanceof Emoji, PROFILE_LIMITS.emojis);
    const emojis: RemoteActorProfileEmoji[] = [];
    for (const tag of tags as Emoji[]) {
      const name = toText(tag.name);
      const href = toHref((await tag.getIcon(options))?.url);
      if (name === null || !href || href.length > PROFILE_LIMITS.emojiUrl) continue;
      const shortcode = name.replace(/^:|:$/g, '');
      if (!EMOJI_SHORTCODE_PATTERN.test(shortcode)) continue;
      emojis.push({ shortcode, url: href });
    }
    return emojis;
  } catch {
    return undefined;
  }
};

const readHeaderUri = async (
  actor: Actor,
  options: FromFedifyActorOptions | undefined,
): Promise<string | null | undefined> => {
  try {
    const image = await actor.getImage(options);
    return toHref(image?.url) ?? null;
  } catch {
    return undefined;
  }
};

const readProfile = async (
  actor: Actor,
  options: FromFedifyActorOptions | undefined,
): Promise<RemoteActorProfile> => {
  const [fields, emojis, headerUri] = await Promise.all([
    readFields(actor, options),
    readEmojis(actor, options),
    readHeaderUri(actor, options),
  ]);
  const published = actor.published;
  return {
    displayName: truncate(toText(actor.name), PROFILE_LIMITS.displayName),
    summary: truncate(toText(actor.summary), PROFILE_LIMITS.summary),
    headerUri,
    actorType: toActorType(actor),
    manuallyApprovesFollowers: actor.manuallyApprovesFollowers ?? null,
    publishedAt: published ? published.epochMilliseconds : null,
    fields,
    emojis,
  };
};

export const ActorIdentity = {
  fromFedifyActor: async (
    actor: Actor,
    options?: FromFedifyActorOptions,
  ): RA<ActorIdentity, ParseActorIdentityError> => {
    if (!actor.id) {
      return RA.err(ParseActorIdentityError.create('Actor id is missing'));
    }
    if (!actor.inboxId) {
      return RA.err(ParseActorIdentityError.create('Actor inboxId is missing'));
    }
    const icon = await actor.getIcon(options);
    return RA.ok({
      uri: actor.id.href,
      inboxUrl: actor.inboxId.href,
      url: actor.url?.href?.toString() ?? undefined,
      username: actor.preferredUsername?.toString() ?? undefined,
      logoUri: toHref(icon?.url),
      profile: await readProfile(actor, options),
    });
  },
} as const;
