import type { Status } from '../../adaptor/mastodon/entities.ts';
import { safeUrl } from '../../helper/safeUrl.ts';
import { withoutAnchors } from '../api/quote.ts';
import { accountHandle } from '../api/status.ts';

/**
 * 返信欄の上に出す、返信先の投稿の抜粋。
 * 書いている途中で誤って移動しないよう、リンクにはしない。
 */
export const ReplyTargetCard = ({ status }: Readonly<{ status: Status }>) => {
  const avatarUrl = safeUrl(status.account.avatar);
  const displayName = status.account.display_name.trim() === '' ? status.account.username : status.account.display_name;
  const concealmentLabel = status.spoiler_text !== ''
    ? status.spoiler_text
    : status.sensitive
    ? 'センシティブな内容'
    : undefined;
  const mediaCount = status.media_attachments.length;

  return (
    <div
      aria-label='返信先の投稿'
      class='mb-3 flex-shrink-0 rounded-xl border border-warm-gray dark:border-gray-700 p-3'
    >
      <div class='flex items-center gap-2 min-w-0'>
        <span class='w-5 h-5 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white text-xs flex-shrink-0'>
          {avatarUrl
            ? <img src={avatarUrl} alt='' class='w-5 h-5 blob-avatar object-cover' loading='lazy' />
            : status.account.username.charAt(0).toUpperCase()}
        </span>
        <span class='truncate text-sm font-semibold text-charcoal dark:text-white'>{displayName}</span>
        <span class='truncate text-xs text-charcoal-light dark:text-gray-400'>@{accountHandle(status.account)}</span>
      </div>
      {concealmentLabel === undefined
        ? (
          <div
            class='mt-1 text-sm text-charcoal-light dark:text-gray-300 prose dark:prose-invert prose-sm max-w-none break-words line-clamp-4 [&_p]:mb-1 [&_.invisible]:visible'
            dangerouslySetInnerHTML={{ __html: withoutAnchors(status.content) }}
          />
        )
        : <p class='mt-1 text-sm text-charcoal-light dark:text-gray-300 break-words'>{concealmentLabel}</p>}
      {mediaCount > 0 && <p class='mt-1 text-xs text-charcoal-light dark:text-gray-400'>画像など {mediaCount} 件</p>}
    </div>
  );
};
