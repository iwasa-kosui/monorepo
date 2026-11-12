import type { BlueskyStrongRef } from './blueskyCrosspost.ts';

export type BlueskyBlob = Readonly<{
  $type: 'blob';
  ref: Readonly<{ $link: string }>;
  mimeType: string;
  size: number;
}>;

export type BlueskyFacet = Readonly<{
  index: Readonly<{ byteStart: number; byteEnd: number }>;
  features: readonly [Readonly<{ $type: 'app.bsky.richtext.facet#link'; uri: string }>];
}>;

export type BlueskyMentionFacet = Readonly<{
  index: Readonly<{ byteStart: number; byteEnd: number }>;
  features: readonly [Readonly<{ $type: 'app.bsky.richtext.facet#mention'; did: string }>];
}>;

export type BlueskyEmbed =
  | Readonly<{
    $type: 'app.bsky.embed.images';
    images: ReadonlyArray<Readonly<{ alt: string; image: BlueskyBlob }>>;
  }>
  | Readonly<{
    $type: 'app.bsky.embed.external';
    external: Readonly<{ uri: string; title: string; description: string; thumb?: BlueskyBlob }>;
  }>
  | Readonly<{
    $type: 'app.bsky.embed.record';
    record: BlueskyStrongRef;
  }>
  | Readonly<{
    $type: 'app.bsky.embed.recordWithMedia';
    record: Readonly<{ record: BlueskyStrongRef }>;
    media: Readonly<{
      $type: 'app.bsky.embed.images';
      images: ReadonlyArray<Readonly<{ alt: string; image: BlueskyBlob }>>;
    }>;
  }>;

export type BlueskyPostRecord = Readonly<{
  $type: 'app.bsky.feed.post';
  text: string;
  createdAt: string;
  facets?: ReadonlyArray<BlueskyFacet | BlueskyMentionFacet>;
  reply?: Readonly<{ root: BlueskyStrongRef; parent: BlueskyStrongRef }>;
  embed?: BlueskyEmbed;
  langs?: readonly string[];
  labels?: Readonly<{ $type: 'com.atproto.label.defs#selfLabels'; values: ReadonlyArray<Readonly<{ val: string }>> }>;
}>;
