import { Result } from '@iwasa-kosui/result';

import {
  BlueskyCrosspost,
  type BlueskyReplyContext,
  type BlueskySkipReason,
  type BlueskyStrongRef,
} from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type {
  BlueskyBlob,
  BlueskyEmbed,
  BlueskyFacet,
  BlueskyPostRecord,
} from '../../domain/blueskyCrosspost/blueskyPostRecord.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import { htmlToTextWithLinks, type TextLink } from './htmlToTextWithLinks.ts';

export const BLUESKY_MAX_GRAPHEMES = 300;
export const BLUESKY_MAX_TEXT_BYTES = 3000;
export const BLUESKY_MAX_IMAGE_BYTES = 2_000_000;
export const BLUESKY_MAX_IMAGES = 4;
export const BLUESKY_MAX_THUMB_BYTES = 1_000_000;

export type BlueskyImageInput = Readonly<{ bytes: Uint8Array; mimeType: string; alt: string | null }>;
export type BlueskyThumbInput = Readonly<{ bytes: Uint8Array; mimeType: string }>;
export type BlueskyLinkPreviewInput = Readonly<{
  url: string;
  title: string | null;
  description: string | null;
  thumb?: BlueskyThumbInput;
}>;

export type BuildBlueskyPostInput = Readonly<{
  html: string;
  summary: string | null;
  sensitive: boolean;
  postUrl: string;
  images: readonly BlueskyImageInput[];
  unavailableImageCount?: number;
  linkPreview?: BlueskyLinkPreviewInput;
  replyTo: BlueskyReplyContext;
  createdAt: Instant;
}>;

export type BlueskyPostDraft = Readonly<{
  text: string;
  facets: readonly BlueskyFacet[];
  images: readonly BlueskyImageInput[];
  external?: Readonly<{ uri: string; title: string; description: string; thumb?: BlueskyThumbInput }>;
  reply?: Readonly<{ root: BlueskyStrongRef; parent: BlueskyStrongRef }>;
  createdAt: string;
}>;

export type BlueskyEmbedBlobs = Readonly<{
  images: readonly BlueskyBlob[];
  thumb?: BlueskyBlob;
}>;

const encoder = new TextEncoder();
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });

const graphemesOf = (text: string): string[] => Array.from(segmenter.segment(text), (part) => part.segment);
const byteLengthOf = (text: string): number => encoder.encode(text).byteLength;
const fits = (text: string): boolean =>
  graphemesOf(text).length <= BLUESKY_MAX_GRAPHEMES && byteLengthOf(text) <= BLUESKY_MAX_TEXT_BYTES;

export const selectBlueskyImages = (
  images: readonly BlueskyImageInput[],
): Readonly<{ kept: readonly BlueskyImageInput[]; droppedCount: number }> => {
  const small = images.filter((image) => image.bytes.byteLength <= BLUESKY_MAX_IMAGE_BYTES);
  const kept = small.slice(0, BLUESKY_MAX_IMAGES);
  return { kept, droppedCount: images.length - kept.length };
};

const toFacet = (text: string, link: TextLink): BlueskyFacet => ({
  index: {
    byteStart: byteLengthOf(text.slice(0, link.start)),
    byteEnd: byteLengthOf(text.slice(0, link.end)),
  },
  features: [{ $type: 'app.bsky.richtext.facet#link', uri: link.uri }],
});

const truncateWithUrl = (
  body: string,
  links: readonly TextLink[],
  postUrl: string,
): Readonly<{ text: string; links: readonly TextLink[] }> => {
  const suffix = `…\n${postUrl}`;
  const characters = graphemesOf(body);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(characters.slice(0, middle).join('').trimEnd() + suffix)) low = middle;
    else high = middle - 1;
  }
  const kept = characters.slice(0, low).join('').trimEnd();
  const text = kept + suffix;
  return {
    text,
    links: [
      ...links.filter((link) => link.end <= kept.length),
      { start: text.length - postUrl.length, end: text.length, uri: postUrl },
    ],
  };
};

const composeText = (
  html: string,
  postUrl: string,
  needsPostUrl: boolean,
): Readonly<{ text: string; links: readonly TextLink[] }> => {
  const parsed = htmlToTextWithLinks(html);
  if (!fits(parsed.text)) return truncateWithUrl(parsed.text, parsed.links, postUrl);
  if (!needsPostUrl) return parsed;
  const text = parsed.text === '' ? postUrl : `${parsed.text}\n${postUrl}`;
  if (!fits(text)) return truncateWithUrl(parsed.text, parsed.links, postUrl);
  return {
    text,
    links: [...parsed.links, { start: text.length - postUrl.length, end: text.length, uri: postUrl }],
  };
};

export const buildBlueskyPostDraft = (
  input: BuildBlueskyPostInput,
): Result<BlueskyPostDraft, BlueskySkipReason> => {
  const skipReason = BlueskyCrosspost.decideSkip(input);
  if (skipReason !== undefined) return Result.err(skipReason);
  if (input.replyTo.kind === 'waiting') return Result.err('reply_to_unsent');

  const { kept, droppedCount } = selectBlueskyImages(input.images);
  const { text, links } = composeText(
    input.html,
    input.postUrl,
    droppedCount + (input.unavailableImageCount ?? 0) > 0,
  );
  const preview = kept.length === 0 ? input.linkPreview : undefined;
  const thumb = preview?.thumb !== undefined && preview.thumb.bytes.byteLength <= BLUESKY_MAX_THUMB_BYTES
    ? preview.thumb
    : undefined;
  return Result.ok({
    text,
    facets: links.map((link) => toFacet(text, link)).sort((a, b) => a.index.byteStart - b.index.byteStart),
    images: kept,
    ...(preview === undefined ? {} : {
      external: {
        uri: preview.url,
        title: preview.title ?? preview.url,
        description: preview.description ?? '',
        ...(thumb === undefined ? {} : { thumb }),
      },
    }),
    ...(input.replyTo.kind === 'sent' ? { reply: { root: input.replyTo.root, parent: input.replyTo.parent } } : {}),
    createdAt: new Date(input.createdAt).toISOString(),
  });
};

const toEmbed = (draft: BlueskyPostDraft, blobs: BlueskyEmbedBlobs): BlueskyEmbed | undefined => {
  if (draft.images.length > 0) {
    return {
      $type: 'app.bsky.embed.images',
      images: draft.images.flatMap((image, index) => {
        const blob = blobs.images[index];
        return blob === undefined ? [] : [{ alt: image.alt ?? '', image: blob }];
      }),
    };
  }
  if (draft.external !== undefined) {
    const { uri, title, description } = draft.external;
    return {
      $type: 'app.bsky.embed.external',
      external: { uri, title, description, ...(blobs.thumb === undefined ? {} : { thumb: blobs.thumb }) },
    };
  }
  return undefined;
};

export const toBlueskyPostRecord = (draft: BlueskyPostDraft, blobs: BlueskyEmbedBlobs): BlueskyPostRecord => {
  const embed = toEmbed(draft, blobs);
  return {
    $type: 'app.bsky.feed.post',
    text: draft.text,
    createdAt: draft.createdAt,
    ...(draft.facets.length === 0 ? {} : { facets: draft.facets }),
    ...(draft.reply === undefined ? {} : { reply: draft.reply }),
    ...(embed === undefined ? {} : { embed }),
  };
};
