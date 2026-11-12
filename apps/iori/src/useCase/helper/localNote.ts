import type { RequestContext } from '@fedify/fedify';
import { Note } from '@fedify/vocab';
import { Temporal } from '@js-temporal/polyfill';

import type { LocalPost } from '../../domain/post/post.ts';
import { sanitizePostContent } from '../../domain/post/sanitizePostContent.ts';
import { toMentionNoteFields } from './mentionNote.ts';
import { toPostAddressing } from './postAddressing.ts';
import { toImageDocument } from './postImageDocument.ts';
import type { PostImageSource } from './postImages.ts';
import type { QuoteNoteFields } from './quoteNote.ts';

export const buildLocalNote = (
  { ctx, identifier, post, images, origin, quote }: Readonly<{
    ctx: RequestContext<unknown>;
    identifier: string;
    post: LocalPost;
    images: ReadonlyArray<PostImageSource>;
    origin: string;
    quote?: QuoteNoteFields;
  }>,
): Note => {
  const content = sanitizePostContent(post.content);
  const mentionFields = toMentionNoteFields(content, quote?.actors);
  const objectUri = ctx.getObjectUri(Note, { identifier, id: post.postId });
  return new Note({
    id: objectUri,
    attribution: ctx.getActorUri(identifier),
    ...toPostAddressing({
      visibility: post.visibility,
      followersUri: ctx.getFollowersUri(identifier),
      mentionUris: mentionFields.ccs,
    }),
    tags: mentionFields.tags,
    content,
    mediaType: 'text/html',
    published: Temporal.Instant.fromEpochMilliseconds(post.createdAt),
    url: objectUri,
    summary: post.summary,
    sensitive: post.sensitive,
    replyTarget: post.inReplyToUri !== null ? new URL(post.inReplyToUri) : undefined,
    quoteUrl: quote?.quoteUrl,
    attachments: images.map((image) => toImageDocument(image, origin)),
  });
};
