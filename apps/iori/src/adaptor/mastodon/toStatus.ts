import type { PostWithAuthor } from '../../domain/post/post.ts';
import type { RepostId } from '../../domain/repost/repostId.ts';
import type { RepostTimelineItem } from '../../domain/timeline/timelineItem.ts';
import type { Account, MediaAttachment, PreviewCard, Status } from './entities.ts';
import { toIsoString } from './time.ts';

export type ToStatusOptions = Readonly<{
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
): MediaAttachment[] =>
  post.images.flatMap((image, index): MediaAttachment[] => {
    const id = mediaAttachmentIds[index];
    if (id === undefined) return [];
    return [{
      id,
      type: 'image',
      url: image.url,
      preview_url: image.url,
      remote_url: null,
      meta: null,
      description: image.altText,
      blurhash: null,
    }];
  });

const toCard = (linkPreviews: LinkPreviews): PreviewCard | null => {
  const first = linkPreviews[0];
  if (first === undefined) return null;
  return {
    url: first.url,
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
    image: first.imageUrl,
    image_description: '',
    embed_url: '',
    blurhash: null,
  };
};

const toPostUri = (post: PostWithAuthor, account: Account): string =>
  post.type === 'remote' ? post.uri : `${account.uri}/posts/${post.postId}`;

export const toStatus = (post: PostWithAuthor, options: ToStatusOptions): Status => {
  const uri = toPostUri(post, options.account);
  return {
    id: post.postId,
    uri,
    created_at: toIsoString(post.createdAt),
    account: options.account,
    content: post.content,
    visibility: 'public',
    sensitive: false,
    spoiler_text: '',
    media_attachments: toMediaAttachments(post, options.mediaAttachmentIds),
    mentions: [],
    tags: [],
    emojis: [],
    reblogs_count: post.repostCount,
    favourites_count: post.likeCount,
    replies_count: options.repliesCount,
    url: uri,
    in_reply_to_id: options.inReplyToId,
    in_reply_to_account_id: options.inReplyToAccountId,
    reblog: null,
    poll: null,
    card: toCard(post.linkPreviews),
    language: null,
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
        url: reaction.emojiImageUrl,
        me: options.myReactionEmojis.has(reaction.emoji),
      })),
      link_previews: post.linkPreviews.map((preview) => ({
        url: preview.url,
        title: preview.title,
        description: preview.description,
        image: preview.imageUrl,
        site_name: preview.siteName,
        favicon: preview.faviconUrl,
      })),
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
  language: null,
  edited_at: null,
  favourited: options.reblog.favourited,
  reblogged: options.reblog.reblogged,
  muted: false,
  bookmarked: false,
  pinned: false,
});
