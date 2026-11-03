import type { Account, Status } from '../adaptor/mastodon/entities.ts';
import type { Actor } from '../domain/actor/actor.ts';
import type { PostWithAuthor } from '../domain/post/post.ts';

const hostOf = (uri: string): string => {
  try {
    return new URL(uri).host;
  } catch {
    return '';
  }
};

const toAccount = (props: {
  id: string;
  username: string;
  acct: string;
  uri: string;
  url: string;
  logoUri: string | undefined;
}): Account => ({
  id: props.id,
  username: props.username,
  acct: props.acct,
  url: props.url,
  uri: props.uri,
  display_name: props.username,
  note: '',
  avatar: props.logoUri ?? '',
  avatar_static: props.logoUri ?? '',
  header: '',
  header_static: '',
  locked: false,
  fields: [],
  emojis: [],
  bot: false,
  group: false,
  discoverable: null,
  indexable: false,
  hide_collections: null,
  created_at: new Date(0).toISOString(),
  last_status_at: null,
  statuses_count: 0,
  followers_count: 0,
  following_count: 0,
});

export const actorToAccount = (actor: Actor): Account => {
  if (actor.type === 'local') {
    const username = actor.uri.split('/').filter((segment) => segment.length > 0).pop() ?? actor.uri;
    return toAccount({
      id: actor.id,
      username,
      acct: username,
      uri: actor.uri,
      url: actor.uri,
      logoUri: actor.logoUri,
    });
  }
  const username = actor.username ?? actor.uri;
  const host = hostOf(actor.url ?? actor.uri);
  return toAccount({
    id: actor.id,
    username,
    acct: host.length > 0 ? `${username}@${host}` : `${username}@unknown`,
    uri: actor.uri,
    url: actor.url ?? actor.uri,
    logoUri: actor.logoUri,
  });
};

export const postToStatus = (post: PostWithAuthor): Status => {
  const username = String(post.username);
  const origin = globalThis.location?.origin ?? '';
  const isLocal = post.type === 'local';
  const host = isLocal ? '' : hostOf(post.uri);
  const accountUri = isLocal ? `${origin}/users/${username}` : post.uri;
  const uri = isLocal ? `${accountUri}/posts/${post.postId}` : post.uri;
  return {
    id: post.postId,
    uri,
    created_at: new Date(post.createdAt).toISOString(),
    account: toAccount({
      id: post.actorId,
      username,
      acct: isLocal ? username : `${username}@${host.length > 0 ? host : 'unknown'}`,
      uri: accountUri,
      url: accountUri,
      logoUri: post.logoUri,
    }),
    content: post.content,
    visibility: 'public',
    sensitive: false,
    spoiler_text: '',
    media_attachments: (post.images ?? []).map((image, index) => ({
      id: `${post.postId}:${index}`,
      type: 'image',
      url: image.url,
      preview_url: image.url,
      remote_url: null,
      meta: null,
      description: image.altText,
      blurhash: null,
    })),
    mentions: [],
    tags: [],
    emojis: [],
    reblogs_count: post.repostCount,
    favourites_count: post.likeCount,
    replies_count: 0,
    url: uri,
    in_reply_to_id: post.inReplyToUri ?? null,
    in_reply_to_account_id: null,
    reblog: null,
    poll: null,
    card: null,
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
        me: false,
      })),
      link_previews: (post.linkPreviews ?? []).map((preview) => ({
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
