import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyTimelineEmbed } from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';
import { blueskyPostUrl, blueskyPostUrlOfUri, segmentBlueskyText } from './blueskyRichText.ts';

type Props = Readonly<{ item: IoriBlueskyTimelineItemBody; dataIndex?: number; isSelected?: boolean }>;
type MediaEmbed = Extract<BlueskyTimelineEmbed, { type: 'images' | 'external' | 'video' }>;
type QuoteEmbed = Extract<BlueskyTimelineEmbed, { type: 'record' }>;

const linkClass = 'text-terracotta hover:underline dark:text-terracotta-light break-all';
const mutedClass = 'text-charcoal-light dark:text-gray-400';

const BlueskyText = ({ text, facets }: Readonly<{ text: string; facets: IoriBlueskyTimelineItemBody['facets'] }>) => (
  <p class='whitespace-pre-wrap break-words text-charcoal dark:text-gray-100'>
    {segmentBlueskyText(text, facets).map((segment) =>
      segment.href === undefined
        ? <span>{segment.text}</span>
        : <a href={segment.href} target='_blank' rel='noopener noreferrer' class={linkClass}>{segment.text}</a>
    )}
  </p>
);

const BlueskyQuote = ({ quote }: Readonly<{ quote: QuoteEmbed }>) => {
  const href = blueskyPostUrlOfUri(quote.uri);
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
        target='_blank'
        rel='noopener noreferrer'
        class='block rounded-xl border border-warm-gray dark:border-gray-700 p-3 hover:bg-sand-light/50 dark:hover:bg-gray-700/50 transition-colors'
      >
        {body}
      </a>
    );
};

const BlueskyMedia = ({ media, postHref }: Readonly<{ media: MediaEmbed; postHref: string | undefined }>) => {
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
    case 'video': {
      const thumbnail = safeAbsoluteUrl(media.thumbnail);
      return (
        <a
          href={postHref ?? safeAbsoluteUrl(media.playlist)}
          target='_blank'
          rel='noopener noreferrer'
          class='relative block overflow-hidden rounded-xl bg-sand dark:bg-gray-700'
        >
          {thumbnail !== undefined && (
            <img
              src={thumbnail}
              alt=''
              class='w-full max-h-96 object-cover'
              loading='lazy'
            />
          )}
          <span class='absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white'>動画</span>
        </a>
      );
    }
  }
};

const BlueskyEmbed = ({ embed, postHref }: Readonly<{ embed: BlueskyTimelineEmbed; postHref: string | undefined }>) => {
  if (embed.type === 'record') return <BlueskyQuote quote={embed} />;
  if (embed.type === 'recordWithMedia') {
    return (
      <div class='space-y-2'>
        <BlueskyMedia media={embed.media} postHref={postHref} />
        <BlueskyQuote quote={embed.record} />
      </div>
    );
  }
  return <BlueskyMedia media={embed} postHref={postHref} />;
};

export const BlueskyTimelineItemView = ({ item, dataIndex, isSelected }: Props) => {
  const avatar = safeAbsoluteUrl(item.authorAvatar);
  const postHref = blueskyPostUrl(item.authorDid, item.uri);
  const displayName = item.authorDisplayName ?? item.authorHandle;
  const posted = (
    <time dateTime={new Date(item.postedAt).toISOString()}>
      {Instant.formatRelative(item.postedAt as Instant)}
    </time>
  );
  return (
    <article
      data-post-index={dataIndex}
      class={`bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-4 space-y-2 ${
        isSelected === true ? 'ring-2 ring-terracotta/30 dark:ring-terracotta-light/30' : ''
      }`}
    >
      {item.repostedByHandle !== null && <div class={`text-xs ${mutedClass}`}>@{item.repostedByHandle} がリポスト</div>}
      {item.replyParentUri !== null && (
        <div class={`text-xs ${mutedClass}`}>
          {item.replyParentAuthorHandle === null ? '返信' : `@${item.replyParentAuthorHandle} への返信`}
        </div>
      )}
      <div class='flex items-center gap-2'>
        <span class='w-8 h-8 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 shadow-clay-sm overflow-hidden'>
          {avatar === undefined
            ? item.authorHandle.charAt(0).toUpperCase()
            : <img src={avatar} alt='' class='w-8 h-8 blob-avatar object-cover' loading='lazy' />}
        </span>
        <div class='min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2'>
          <span class='font-semibold text-charcoal dark:text-white truncate'>{displayName}</span>
          <span class={`text-sm ${mutedClass} truncate`}>@{item.authorHandle}</span>
        </div>
        {postHref === undefined
          ? <span class={`text-sm ${mutedClass}`} title={new Date(item.postedAt).toLocaleString()}>{posted}</span>
          : (
            <a
              href={postHref}
              target='_blank'
              rel='noopener noreferrer'
              class={`text-sm ${mutedClass} hover:text-terracotta dark:hover:text-terracotta-light transition-colors flex-shrink-0`}
              title={new Date(item.postedAt).toLocaleString()}
            >
              {posted}
            </a>
          )}
      </div>
      {item.text !== '' && <BlueskyText text={item.text} facets={item.facets} />}
      {item.embed !== null && <BlueskyEmbed embed={item.embed} postHref={postHref} />}
    </article>
  );
};
