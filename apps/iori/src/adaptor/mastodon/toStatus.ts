import { containsKana } from '../../domain/aiTranslation/isJapanese.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import type { Visibility } from '../../domain/post/visibility.ts';
import type { RepostId } from '../../domain/repost/repostId.ts';
import type { RepostTimelineItem } from '../../domain/timeline/timelineItem.ts';
import { htmlToPlainText } from '../text/htmlToPlainText.ts';
import type { Account, MediaAttachment, PreviewCard, Status } from './entities.ts';
import { toSafeApiUrl } from './safeApiUrl.ts';
import { sanitizeStatusContent } from './sanitizeContent.ts';
import { toIsoString } from './time.ts';

export type ToStatusOptions = Readonly<{
  baseUrl: string;
  account: Account;
  mediaAttachmentIds: ReadonlyArray<string>;
  repliesCount: number;
  inReplyToId: string | null;
  inReplyToAccountId: string | null;
  myReactionEmojis: ReadonlySet<string>;
}>;

type LinkPreviews = PostWithAuthor['linkPreviews'];

const toMediaAttachments = (
  post: PostWithAuthor,
  mediaAttachmentIds: ReadonlyArray<string>,
  baseUrl: string,
): MediaAttachment[] =>
  post.images.flatMap((image, index): MediaAttachment[] => {
    const id = mediaAttachmentIds[index];
    const url = toSafeApiUrl(image.url, baseUrl);
    if (id === undefined || url === undefined) return [];
    return [{
      id,
      type: 'image',
      url,
      preview_url: url,
      remote_url: null,
      meta: null,
      description: image.altText,
      blurhash: null,
    }];
  });

const toCard = (linkPreviews: LinkPreviews, baseUrl: string): PreviewCard | null => {
  const first = linkPreviews[0];
  if (first === undefined) return null;
  const url = toSafeApiUrl(first.url, baseUrl);
  if (url === undefined) return null;
  return {
    url,
    title: first.title ?? '',
    description: first.description ?? '',
    type: 'link',
    authors: [],
    author_name: '',
    author_url: '',
    provider_name: first.siteName ?? '',
    provider_url: '',
    html: '',
    width: 0,
    height: 0,
    image: toSafeApiUrl(first.imageUrl, baseUrl) ?? null,
    image_description: '',
    embed_url: '',
    blurhash: null,
  };
};

const toPostUrls = (
  post: PostWithAuthor,
  options: ToStatusOptions,
): Readonly<{ uri: string; url: string | null }> => {
  if (post.type === 'local') {
    const uri = `${options.account.uri}/posts/${post.postId}`;
    return { uri, url: uri };
  }
  const safe = toSafeApiUrl(post.uri, options.baseUrl);
  return {
    uri: safe ?? new URL(`/api/v1/statuses/${post.postId}`, options.baseUrl).href,
    url: safe ?? null,
  };
};

const toLanguage = (html: string): string | null => {
  const text = htmlToPlainText(html, Number.MAX_SAFE_INTEGER);
  if (text === '') return null;
  return containsKana(text) ? 'ja' : 'und';
};

const toVisibility = (post: PostWithAuthor): Visibility =>
  post.type === 'local' ? 'public' : post.visibility ?? 'private';

export const toStatus = (post: PostWithAuthor, options: ToStatusOptions): Status => {
  const { uri, url } = toPostUrls(post, options);
  return {
    id: post.postId,
    uri,
    created_at: toIsoString(post.createdAt),
    account: options.account,
    content: sanitizeStatusContent(post.content),
    visibility: toVisibility(post),
    sensitive: false,
    spoiler_text: '',
    media_attachments: toMediaAttachments(post, options.mediaAttachmentIds, options.baseUrl),
    mentions: [],
    tags: [],
    emojis: [],
    reblogs_count: post.repostCount,
    favourites_count: post.likeCount,
    replies_count: options.repliesCount,
    url,
    in_reply_to_id: options.inReplyToId,
    in_reply_to_account_id: options.inReplyToAccountId,
    reblog: null,
    poll: null,
    card: toCard(post.linkPreviews, options.baseUrl),
    language: toLanguage(post.content),
    edited_at: null,
    favourited: post.liked,
    reblogged: post.reposted,
    muted: false,
    bookmarked: false,
    pinned: false,
    iori: {
      reactions: post.reactions.map((reaction) => ({
        emoji: reaction.emoji,
        count: reaction.count,
        url: toSafeApiUrl(reaction.emojiImageUrl, options.baseUrl) ?? null,
        me: options.myReactionEmojis.has(reaction.emoji),
      })),
      link_previews: post.linkPreviews.flatMap((preview) => {
        const url = toSafeApiUrl(preview.url, options.baseUrl);
        return url === undefined ? [] : [{
          url,
          title: preview.title,
          description: preview.description,
          image: toSafeApiUrl(preview.imageUrl, options.baseUrl) ?? null,
          site_name: preview.siteName,
          favicon: toSafeApiUrl(preview.faviconUrl, options.baseUrl) ?? null,
        }];
      }),
    },
  };
};

export type ToReblogStatusOptions = Readonly<{
  repostId: RepostId;
  account: Account;
  reblog: Status;
}>;

export const toReblogStatus = (
  item: Pick<RepostTimelineItem, 'createdAt'>,
  options: ToReblogStatusOptions,
): Status => ({
  id: options.repostId,
  uri: `${options.account.uri}/reposts/${options.repostId}`,
  created_at: toIsoString(item.createdAt),
  account: options.account,
  content: '',
  visibility: 'public',
  sensitive: false,
  spoiler_text: '',
  media_attachments: [],
  mentions: [],
  tags: [],
  emojis: [],
  reblogs_count: 0,
  favourites_count: 0,
  replies_count: 0,
  url: null,
  in_reply_to_id: null,
  in_reply_to_account_id: null,
  reblog: options.reblog,
  poll: null,
  card: null,
  language: options.reblog.language,
  edited_at: null,
  favourited: options.reblog.favourited,
  reblogged: options.reblog.reblogged,
  muted: false,
  bookmarked: false,
  pinned: false,
});
