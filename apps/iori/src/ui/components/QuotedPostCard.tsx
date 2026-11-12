import type { Status } from '../../adaptor/mastodon/entities.ts';
import { safeUrl } from '../../helper/safeUrl.ts';
import type { QuoteView } from '../api/quote.ts';
import { withoutAnchors } from '../api/quote.ts';
import { accountHandle, detailHref } from '../api/status.ts';

const cardClass = 'block rounded-xl border border-warm-gray dark:border-gray-700 overflow-hidden';

const QuotedStatus = ({ status }: Readonly<{ status: Status }>) => {
  const avatarUrl = safeUrl(status.account.avatar);
  const displayName = status.account.display_name.trim() === '' ? status.account.username : status.account.display_name;
  const concealmentLabel = status.spoiler_text !== ''
    ? status.spoiler_text
    : status.sensitive
    ? 'センシティブな内容'
    : undefined;
  const images = status.media_attachments.filter((attachment) => attachment.type === 'image');

  return (
    <div class={`${cardClass} p-3`}>
      <a
        href={detailHref(status)}
        class='block hover:bg-sand-light/50 dark:hover:bg-gray-700/50 transition-colors rounded-lg'
      >
        <div class='flex items-center gap-2'>
          <span class='w-5 h-5 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white text-xs flex-shrink-0'>
            {avatarUrl
              ? <img src={avatarUrl} alt='' class='w-5 h-5 blob-avatar object-cover' loading='lazy' />
              : status.account.username.charAt(0).toUpperCase()}
          </span>
          <span class='min-w-0 flex flex-wrap items-baseline gap-x-2'>
            <span class='text-sm font-semibold text-charcoal dark:text-white truncate'>{displayName}</span>
            <span class='text-xs text-charcoal-light dark:text-gray-400 truncate'>
              @{accountHandle(status.account)}
            </span>
          </span>
        </div>
        {concealmentLabel === undefined
          ? (
            <div
              class='mt-1 text-sm text-charcoal dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none break-words line-clamp-4 [&_p]:mb-1 [&_.invisible]:visible'
              dangerouslySetInnerHTML={{ __html: withoutAnchors(status.content) }}
            />
          )
          : <p class='mt-1 text-sm text-charcoal dark:text-gray-200 break-words'>{concealmentLabel}</p>}
      </a>
      {concealmentLabel === undefined && images.length > 0 && (
        <div class='mt-2 grid grid-cols-2 gap-2'>
          {images.map((image, index) => {
            const imageUrl = safeUrl(image.preview_url ?? image.url);
            const linkUrl = safeUrl(image.url);
            if (!imageUrl || !linkUrl) return null;
            return (
              <a
                key={index}
                href={linkUrl}
                target='_blank'
                rel='noopener noreferrer'
                class='block overflow-hidden rounded-lg'
              >
                <img
                  src={imageUrl}
                  alt={image.description || 'Post image'}
                  class='w-full h-24 object-cover hover:opacity-90 transition-opacity'
                  loading='lazy'
                />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};

const QuoteLink = ({ url }: Readonly<{ url: string }>) => {
  const href = safeUrl(url);
  if (!href) return null;
  const host = (() => {
    try {
      return new URL(href).hostname;
    } catch {
      return href;
    }
  })();

  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      class={`${cardClass} p-3 hover:bg-sand-light/50 dark:hover:bg-gray-700/50 transition-colors`}
    >
      <span class='block text-sm font-medium text-charcoal dark:text-white'>引用元の投稿を開く</span>
      <span class='block text-xs text-charcoal-light dark:text-gray-400 truncate'>{host}</span>
    </a>
  );
};

export const QuotedPostCard = ({ quote }: Readonly<{ quote: QuoteView }>) =>
  quote.kind === 'card' ? <QuotedStatus status={quote.status} /> : <QuoteLink url={quote.url} />;
