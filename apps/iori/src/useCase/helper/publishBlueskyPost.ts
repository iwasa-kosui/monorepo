import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import {
  BLUESKY_MAX_GRAPHEMES,
  BLUESKY_MAX_IMAGE_BYTES,
  BLUESKY_MAX_IMAGES,
  BLUESKY_MAX_TEXT_BYTES,
  type BlueskyLinkPreviewInput,
  byteLengthOf,
  graphemesOf,
  toExternalDraft,
  toExternalEmbed,
  toFacet,
} from '../../adaptor/bluesky/blueskyPostRecord.ts';
import type { BlueskyStrongRef } from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import { BlueskyInteraction } from '../../domain/blueskyCrosspost/blueskyInteraction.ts';
import type {
  BlueskyBlob,
  BlueskyEmbed,
  BlueskyFacet,
  BlueskyMentionFacet,
  BlueskyPostRecord,
  BlueskyTagFacet,
} from '../../domain/blueskyCrosspost/blueskyPostRecord.ts';
import { blueskyTidOf } from '../../domain/blueskyCrosspost/blueskyRkey.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type {
  BlueskyClient,
  BlueskyClientError,
  BlueskyCreatedRecord,
  BlueskyQueryClient,
} from '../../ports/blueskyClient.ts';
import { type BlueskyLinkPreviewDeps, resolveBlueskyLinkPreview } from './blueskyLinkPreview.ts';
import { findMentionHandles, withMentionFacets } from './blueskyMentionFacets.ts';
import { withTagFacets } from './blueskyTagFacets.ts';
import { findUrls } from './blueskyTextMatches.ts';

export type BlueskyPostInvalidReason =
  | 'empty'
  | 'too_many_graphemes'
  | 'too_many_bytes'
  | 'too_many_images'
  | 'image_too_large';

export type BlueskyPostInvalid = Readonly<{ type: 'BlueskyPostInvalid'; reason: BlueskyPostInvalidReason }>;

export type BlueskyPostImage = Readonly<{ bytes: Uint8Array; mimeType: string; alt: string }>;

export type PublishBlueskyPostInput = Readonly<{
  text: string;
  reply?: Readonly<{ root: BlueskyStrongRef; parent: BlueskyStrongRef }>;
  quote?: BlueskyStrongRef;
  images?: readonly BlueskyPostImage[];
  langs?: readonly string[];
}>;

export type PublishBlueskyPostInteractionInput =
  & PublishBlueskyPostInput
  & Readonly<{
    interaction?: BlueskyInteraction;
  }>;

export type PublishBlueskyPostDeps = Readonly<{
  client: Pick<BlueskyClient, 'createRecord' | 'uploadBlob'>;
  query: BlueskyQueryClient['query'];
  now: () => Instant;
  linkPreview?: BlueskyLinkPreviewDeps;
}>;

export type PublishBlueskyPostWithInteractionDeps =
  & Omit<PublishBlueskyPostDeps, 'client'>
  & Readonly<{
    client: PublishBlueskyPostDeps['client'] & Pick<BlueskyClient, 'createPostWithGates'>;
  }>;

export type PublishedBlueskyPost = BlueskyCreatedRecord;

export type PublishBlueskyPostError = BlueskyClientError | BlueskyPostInvalid;

const resolveHandleResponseSchema = z.object({ did: z.string().startsWith('did:') });

const invalid = (reason: BlueskyPostInvalidReason): BlueskyPostInvalid => ({ type: 'BlueskyPostInvalid', reason });

export const validateBlueskyPostInput = (input: PublishBlueskyPostInput): BlueskyPostInvalid | undefined => {
  const images = input.images ?? [];
  if (input.text.trim() === '' && images.length === 0) return invalid('empty');
  if (graphemesOf(input.text.trim()).length > BLUESKY_MAX_GRAPHEMES) return invalid('too_many_graphemes');
  if (byteLengthOf(input.text.trim()) > BLUESKY_MAX_TEXT_BYTES) return invalid('too_many_bytes');
  if (images.length > BLUESKY_MAX_IMAGES) return invalid('too_many_images');
  if (images.some((image) => image.bytes.byteLength > BLUESKY_MAX_IMAGE_BYTES)) return invalid('image_too_large');
  return undefined;
};

export const resolveDids = async (
  query: PublishBlueskyPostDeps['query'],
  handles: readonly string[],
): Promise<Map<string, string>> => {
  const entries = await Promise.all([...new Set(handles)].map(async (handle) => {
    const response = await query('com.atproto.identity.resolveHandle', { handle });
    const parsed = response.ok ? resolveHandleResponseSchema.safeParse(response.val) : undefined;
    return parsed?.success === true ? [[handle, parsed.data.did] as const] : [];
  }));
  return new Map(entries.flat());
};

export const buildFacets = async (
  text: string,
  query: PublishBlueskyPostDeps['query'],
): Promise<Array<BlueskyFacet | BlueskyMentionFacet | BlueskyTagFacet>> => {
  const urlFacets = findUrls(text).map((url) => toFacet(text, url));
  const dids = await resolveDids(query, findMentionHandles(text, urlFacets));
  return withTagFacets(text, withMentionFacets(text, urlFacets, dids));
};

const uploadImages = async (
  client: PublishBlueskyPostDeps['client'],
  images: readonly BlueskyPostImage[],
): RA<Array<Readonly<{ alt: string; image: BlueskyBlob }>>, BlueskyClientError> => {
  const uploaded: Array<Readonly<{ alt: string; image: BlueskyBlob }>> = [];
  for (const { bytes, mimeType, alt } of images) {
    const blob = await client.uploadBlob({ bytes, mimeType });
    if (!blob.ok) return RA.err(blob.err);
    uploaded.push({ alt, image: blob.val });
  }
  return RA.ok(uploaded);
};

const uploadLinkPreview = async (
  client: PublishBlueskyPostDeps['client'],
  preview: BlueskyLinkPreviewInput,
): Promise<Extract<BlueskyEmbed, { $type: 'app.bsky.embed.external' }>> => {
  const external = toExternalDraft(preview);
  const thumb = external.thumb === undefined ? undefined : await client.uploadBlob(external.thumb);
  return toExternalEmbed(external, thumb?.ok ? thumb.val : undefined);
};

const embedOf = (
  quote: BlueskyStrongRef | undefined,
  images: ReadonlyArray<Readonly<{ alt: string; image: BlueskyBlob }>>,
  external: Extract<BlueskyEmbed, { $type: 'app.bsky.embed.external' }> | undefined,
): BlueskyEmbed | undefined => {
  const media = images.length === 0 ? external : { $type: 'app.bsky.embed.images', images } as const;
  if (quote === undefined) return media;
  if (media === undefined) return { $type: 'app.bsky.embed.record', record: quote };
  return { $type: 'app.bsky.embed.recordWithMedia', record: { record: quote }, media };
};

const clockIdOf = (): number => crypto.getRandomValues(new Uint16Array(1))[0]! & 1023;

const buildBlueskyPost = async (
  { client, query, now, linkPreview }: PublishBlueskyPostDeps,
  input: PublishBlueskyPostInput,
): RA<Readonly<{ record: BlueskyPostRecord; rkey: string }>, PublishBlueskyPostError> => {
  const problem = validateBlueskyPostInput(input);
  if (problem !== undefined) return RA.err(problem);
  const text = input.text.trim();
  const images = await uploadImages(client, input.images ?? []);
  if (!images.ok) return RA.err(images.err);
  const preview = images.val.length === 0 && linkPreview !== undefined
    ? await resolveBlueskyLinkPreview(linkPreview, text)
    : undefined;
  const external = preview === undefined ? undefined : await uploadLinkPreview(client, preview);
  const createdAt = now();
  const facets = await buildFacets(text, query);
  const embed = embedOf(input.quote, images.val, external);
  const record: BlueskyPostRecord = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date(createdAt).toISOString(),
    ...(facets.length === 0 ? {} : { facets }),
    ...(input.reply === undefined ? {} : { reply: input.reply }),
    ...(embed === undefined ? {} : { embed }),
    ...(input.langs === undefined || input.langs.length === 0 ? {} : { langs: input.langs }),
  };
  return RA.ok({ record, rkey: blueskyTidOf({ createdAt, clockId: clockIdOf() }) });
};

export const publishBlueskyPost = async (
  deps: PublishBlueskyPostDeps,
  input: PublishBlueskyPostInput,
): RA<PublishedBlueskyPost, PublishBlueskyPostError> => {
  const built = await buildBlueskyPost(deps, input);
  return built.ok ? deps.client.createRecord(built.val.record, built.val.rkey) : RA.err(built.err);
};

export const publishBlueskyPostWithInteraction = async (
  deps: PublishBlueskyPostWithInteractionDeps,
  { interaction, ...input }: PublishBlueskyPostInteractionInput,
): RA<PublishedBlueskyPost, PublishBlueskyPostError> => {
  const built = await buildBlueskyPost(deps, input);
  if (!built.ok) return RA.err(built.err);
  return interaction === undefined || BlueskyInteraction.isDefault(interaction)
    ? deps.client.createRecord(built.val.record, built.val.rkey)
    : deps.client.createPostWithGates({ ...built.val, interaction });
};
