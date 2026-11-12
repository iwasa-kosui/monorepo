import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyTimelineEmbed } from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { blueskyPostUrl, blueskyProfilePathOf, ioriBlueskyPostPath } from '../../helper/blueskyUrl.ts';
import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';
import { segmentBlueskyText } from './blueskyRichText.ts';
import { BlueskyVideoPlayer } from './BlueskyVideoPlayer.tsx';
import { PostMenu, type PostMenuItem } from './PostMenu.tsx';

type Props = Readonly<{
  item: IoriBlueskyTimelineItemBody;
  dataIndex?: number;
  isSelected?: boolean;
  onReply?: (item: IoriBlueskyTimelineItemBody) => void;
  onQuote?: (item: IoriBlueskyTimelineItemBody) => void;
  onLike?: (item: IoriBlueskyTimelineItemBody) => void;
  onUndoLike?: (item: IoriBlueskyTimelineItemBody) => void;
  isLikePending?: boolean;
  onRepost?: (item: IoriBlueskyTimelineItemBody) => void;
  onUndoRepost?: (item: IoriBlueskyTimelineItemBody) => void;
  isRepostPending?: boolean;
}>;
type MediaEmbed = Extract<BlueskyTimelineEmbed, { type: 'images' | 'external' | 'video' }>;
type QuoteEmbed = Extract<BlueskyTimelineEmbed, { type: 'record' }>;

const linkClass = 'text-terracotta hover:underline dark:text-terracotta-light break-all';
const mutedClass = 'text-charcoal-light dark:text-gray-400';

export const BlueskyText = (
  { text, facets }: Readonly<{ text: string; facets: IoriBlueskyTimelineItemBody['facets'] }>,
) => (
  <p class='whitespace-pre-wrap break-words text-charcoal dark:text-gray-100'>
    {segmentBlueskyText(text, facets).map((segment) =>
      segment.href === undefined
        ? <span>{segment.text}</span>
        : segment.href.startsWith('/')
        ? <a href={segment.href} class={linkClass}>{segment.text}</a>
        : <a href={segment.href} target='_blank' rel='noopener noreferrer' class={linkClass}>{segment.text}</a>
    )}
  </p>
);

const BlueskyQuote = ({ quote }: Readonly<{ quote: QuoteEmbed }>) => {
  const href = ioriBlueskyPostPath(quote.uri);
  const body = (
    <>
      <div class={`text-xs ${mutedClass} mb-1`}>@{quote.authorHandle}</div>
      <p class='text-sm whitespace-pre-wrap break-words text-charcoal dark:text-gray-100'>{quote.text}</p>
    </>
  );
  return href === undefined
    ? <div class='block rounded-xl border border-warm-gray dark:border-gray-700 p-3'>{body}</div>
    : (
      <a
        href={href}
        class='block rounded-xl border border-warm-gray dark:border-gray-700 p-3 hover:bg-sand-light/50 dark:hover:bg-gray-700/50 transition-colors'
      >
        {body}
      </a>
    );
};

const BlueskyMedia = ({ media, bskyHref }: Readonly<{ media: MediaEmbed; bskyHref: string | undefined }>) => {
  switch (media.type) {
    case 'images':
      return (
        <div class={`grid gap-2 ${media.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {media.images.map((image) => {
            const thumb = safeAbsoluteUrl(image.thumb);
            const fullsize = safeAbsoluteUrl(image.fullsize);
            return thumb === undefined
              ? null
              : (
                <a
                  href={fullsize ?? thumb}
                  target='_blank'
                  rel='noopener noreferrer'
                  class='block overflow-hidden rounded-xl'
                >
                  <img src={thumb} alt={image.alt} class='w-full max-h-96 object-cover' loading='lazy' />
                </a>
              );
          })}
        </div>
      );
    case 'external': {
      const uri = safeAbsoluteUrl(media.uri);
      if (uri === undefined) return null;
      const thumb = safeAbsoluteUrl(media.thumb);
      return (
        <a
          href={uri}
          target='_blank'
          rel='noopener noreferrer'
          class='block rounded-xl border border-warm-gray dark:border-gray-700 overflow-hidden hover:bg-sand-light/50 dark:hover:bg-gray-700/50 transition-colors'
        >
          {thumb !== undefined && <img src={thumb} alt='' class='w-full max-h-64 object-cover' loading='lazy' />}
          <div class='p-3'>
            <h4 class='text-sm font-medium text-charcoal dark:text-white line-clamp-2'>{media.title || uri}</h4>
            {media.description && <p class={`text-xs ${mutedClass} line-clamp-2 mt-1`}>{media.description}</p>}
          </div>
        </a>
      );
    }
    case 'video':
      return (
        <BlueskyVideoPlayer
          thumbnail={media.thumbnail}
          playlist={media.playlist}
          aspectRatio={media.aspectRatio}
          alt={media.alt}
          bskyHref={bskyHref}
        />
      );
  }
};

const BlueskyEmbed = ({ embed, bskyHref }: Readonly<{ embed: BlueskyTimelineEmbed; bskyHref: string | undefined }>) => {
  if (embed.type === 'record') return <BlueskyQuote quote={embed} />;
  if (embed.type === 'recordWithMedia') {
    return (
      <div class='space-y-2'>
        <BlueskyMedia media={embed.media} bskyHref={bskyHref} />
        <BlueskyQuote quote={embed.record} />
      </div>
    );
  }
  return <BlueskyMedia media={embed} bskyHref={bskyHref} />;
};

const ReplyParent = ({ uri, label }: Readonly<{ uri: string; label: string }>) => {
  const href = ioriBlueskyPostPath(uri);
  return href === undefined
    ? <div class={`text-xs ${mutedClass}`}>{label}</div>
    : (
      <a href={href} class={`block text-xs ${mutedClass} hover:text-terracotta dark:hover:text-terracotta-light`}>
        {label}
      </a>
    );
};

const BlueskyReplyButton = ({ item, onReply }: Readonly<{
  item: IoriBlueskyTimelineItemBody;
  onReply: (item: IoriBlueskyTimelineItemBody) => void;
}>) => (
  <button
    type='button'
    onClick={(event: Event) => {
      event.stopPropagation();
      onReply(item);
    }}
    class='flex items-center gap-1 transition-colors text-charcoal-light hover:text-terracotta dark:text-gray-400 dark:hover:text-terracotta-light'
    title='返信 (p)'
  >
    <svg
      xmlns='http://www.w3.org/2000/svg'
      class='h-5 w-5'
      fill='none'
      viewBox='0 0 24 24'
      stroke='currentColor'
      stroke-width='2'
    >
      <path stroke-linecap='round' stroke-linejoin='round' d='M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6' />
    </svg>
  </button>
);

const BlueskyQuoteButton = ({ item, onQuote }: Readonly<{
  item: IoriBlueskyTimelineItemBody;
  onQuote: (item: IoriBlueskyTimelineItemBody) => void;
}>) => (
  <button
    type='button'
    onClick={(event: Event) => {
      event.stopPropagation();
      onQuote(item);
    }}
    class='flex items-center gap-1 text-sm transition-colors text-charcoal-light hover:text-terracotta dark:text-gray-400 dark:hover:text-terracotta-light'
    title='引用'
  >
    引用
  </button>
);

const likeTitle = (liked: boolean, isPending: boolean): string => {
  if (isPending) return liked ? 'いいね中...' : 'いいね取り消し中...';
  return liked ? 'いいねを取り消す' : 'いいね';
};

const BlueskyLikeButton = ({ item, onLike, onUndoLike, isPending }: Readonly<{
  item: IoriBlueskyTimelineItemBody;
  onLike: (item: IoriBlueskyTimelineItemBody) => void;
  onUndoLike: ((item: IoriBlueskyTimelineItemBody) => void) | undefined;
  isPending: boolean;
}>) => {
  const handleClick = (event: Event) => {
    event.stopPropagation();
    if (isPending) return;
    if (item.liked) {
      if (onUndoLike && confirm('いいねを取り消しますか？')) onUndoLike(item);
    } else {
      onLike(item);
    }
  };
  return (
    <button
      type='button'
      onClick={handleClick}
      class={`flex items-center gap-1 transition-colors ${
        item.liked
          ? 'text-terracotta dark:text-terracotta-light'
          : isPending
          ? 'text-terracotta-light/50 dark:text-terracotta-dark cursor-wait'
          : 'text-charcoal-light hover:text-terracotta dark:text-gray-400 dark:hover:text-terracotta-light'
      }`}
      title={likeTitle(item.liked, isPending)}
      disabled={isPending}
    >
      <svg
        xmlns='http://www.w3.org/2000/svg'
        class='h-5 w-5'
        fill={item.liked ? 'currentColor' : 'none'}
        viewBox='0 0 24 24'
        stroke='currentColor'
        stroke-width='2'
      >
        <path
          stroke-linecap='round'
          stroke-linejoin='round'
          d='M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z'
        />
      </svg>
    </button>
  );
};

const repostTitle = (reposted: boolean, isPending: boolean): string => {
  if (isPending) return reposted ? 'リポスト中...' : 'リポスト取り消し中...';
  return reposted ? 'リポストを取り消す' : 'リポスト';
};

const BlueskyRepostButton = ({ item, onRepost, onUndoRepost, isPending }: Readonly<{
  item: IoriBlueskyTimelineItemBody;
  onRepost: (item: IoriBlueskyTimelineItemBody) => void;
  onUndoRepost: ((item: IoriBlueskyTimelineItemBody) => void) | undefined;
  isPending: boolean;
}>) => {
  const handleClick = (event: Event) => {
    event.stopPropagation();
    if (isPending) return;
    if (item.reposted) {
      if (onUndoRepost && confirm('リポストを取り消しますか？')) onUndoRepost(item);
    } else {
      onRepost(item);
    }
  };
  return (
    <button
      type='button'
      onClick={handleClick}
      class={`flex items-center gap-1 transition-colors ${
        item.reposted
          ? 'text-sage dark:text-sage'
          : isPending
          ? 'text-sage/50 dark:text-sage-dark cursor-wait'
          : 'text-charcoal-light hover:text-sage dark:text-gray-400 dark:hover:text-sage'
      }`}
      title={repostTitle(item.reposted, isPending)}
      disabled={isPending}
    >
      <svg
        xmlns='http://www.w3.org/2000/svg'
        class='h-5 w-5'
        fill={item.reposted ? 'currentColor' : 'none'}
        viewBox='0 0 24 24'
        stroke='currentColor'
        stroke-width='2'
      >
        <path
          stroke-linecap='round'
          stroke-linejoin='round'
          d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
        />
      </svg>
    </button>
  );
};

export const BlueskyTimelineItemView = ({
  item,
  dataIndex,
  isSelected,
  onReply,
  onQuote,
  onLike,
  onUndoLike,
  isLikePending,
  onRepost,
  onUndoRepost,
  isRepostPending,
}: Props) => {
  const avatar = safeAbsoluteUrl(item.authorAvatar);
  const postHref = ioriBlueskyPostPath(item.uri);
  const bskyHref = blueskyPostUrl(item.authorDid, item.uri);
  const profileHref = blueskyProfilePathOf(item.authorDid);
  const displayName = item.authorDisplayName ?? item.authorHandle;
  const posted = (
    <time dateTime={new Date(item.postedAt).toISOString()}>
      {Instant.formatRelative(item.postedAt as Instant)}
    </time>
  );
  const menuItems: readonly PostMenuItem[] = bskyHref === undefined ? [] : [
    { key: 'open-bluesky', label: 'Bluesky で開く', kind: 'link', href: bskyHref },
    { key: 'copy-link', label: 'リンクをコピー', kind: 'copy', text: bskyHref },
  ];
  return (
    <article
      data-post-index={dataIndex}
      class={`bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 space-y-2 ${
        isSelected === true ? 'ring-2 ring-terracotta/30 dark:ring-terracotta-light/30' : ''
      }`}
    >
      {item.repostedByHandle !== null && (
        <div class={`text-xs ${mutedClass}`}>
          {item.repostedByDid === null
            ? `@${item.repostedByHandle}`
            : <a href={blueskyProfilePathOf(item.repostedByDid)} class='hover:underline'>@{item.repostedByHandle}</a>}
          {' '}
          がリポスト
        </div>
      )}
      {item.replyParentUri !== null && (
        <ReplyParent
          uri={item.replyParentUri}
          label={item.replyParentAuthorHandle === null ? '返信' : `@${item.replyParentAuthorHandle} への返信`}
        />
      )}
      <div class='flex items-center gap-2'>
        <a
          href={profileHref}
          class='w-8 h-8 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 shadow-clay-sm overflow-hidden'
        >
          {avatar === undefined
            ? item.authorHandle.charAt(0).toUpperCase()
            : <img src={avatar} alt='' class='w-8 h-8 blob-avatar object-cover' loading='lazy' />}
        </a>
        <div class='min-w-0 flex-1'>
          <a href={profileHref} class='inline-flex max-w-full flex-wrap items-baseline gap-x-2 group'>
            <span class='font-semibold text-charcoal dark:text-white group-hover:text-terracotta dark:group-hover:text-terracotta-light transition-colors truncate'>
              {displayName}
            </span>
            <span class={`text-sm ${mutedClass} truncate`}>@{item.authorHandle}</span>
          </a>
        </div>
        {postHref === undefined
          ? <span class={`text-sm ${mutedClass}`} title={new Date(item.postedAt).toLocaleString()}>{posted}</span>
          : (
            <a
              href={postHref}
              class={`text-sm ${mutedClass} hover:text-terracotta dark:hover:text-terracotta-light transition-colors flex-shrink-0`}
              title={new Date(item.postedAt).toLocaleString()}
            >
              {posted}
            </a>
          )}
      </div>
      {item.text !== '' && <BlueskyText text={item.text} facets={item.facets} />}
      {item.embed !== null && <BlueskyEmbed embed={item.embed} bskyHref={bskyHref} />}
      {(onReply !== undefined || onQuote !== undefined || onLike !== undefined || onRepost !== undefined
        || menuItems.length > 0) && (
        <div class='flex items-center justify-end gap-4 pt-1'>
          {onReply !== undefined && <BlueskyReplyButton item={item} onReply={onReply} />}
          {onRepost !== undefined && (
            <BlueskyRepostButton
              item={item}
              onRepost={onRepost}
              onUndoRepost={onUndoRepost}
              isPending={isRepostPending === true}
            />
          )}
          {onQuote !== undefined && <BlueskyQuoteButton item={item} onQuote={onQuote} />}
          {onLike !== undefined && (
            <BlueskyLikeButton item={item} onLike={onLike} onUndoLike={onUndoLike} isPending={isLikePending === true} />
          )}
          <PostMenu items={menuItems} />
        </div>
      )}
    </article>
  );
};
