import type { IoriBlueskyChatConvoBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';
import { chatConvoPath, convoTitle, formatChatTime, lastMessageSummary } from '../hooks/blueskyChat.ts';

type Props = Readonly<{ convo: IoriBlueskyChatConvoBody; now: number }>;

export const BlueskyChatConvoRow = ({ convo, now }: Props) => {
  const peer = convo.peers[0];
  const title = convoTitle(convo.peers);
  const avatar = safeAbsoluteUrl(peer?.avatar);
  const sentAt = convo.lastMessage?.sentAt ?? null;
  return (
    <a
      href={chatConvoPath(convo.id)}
      data-testid='bluesky-chat-convo'
      class='flex items-center gap-3 bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-4 hover:bg-sand-light dark:hover:bg-gray-700 transition-colors'
    >
      <span class='w-10 h-10 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 shadow-clay-sm overflow-hidden'>
        {avatar === undefined
          ? title.charAt(0).toUpperCase()
          : <img src={avatar} alt='' class='w-10 h-10 blob-avatar object-cover' loading='lazy' />}
      </span>
      <span class='min-w-0 flex-1'>
        <span class='flex items-baseline gap-x-2'>
          <span class='font-semibold text-charcoal dark:text-white truncate'>{title}</span>
          {peer !== undefined && (
            <span class='text-sm text-charcoal-light dark:text-gray-400 truncate'>@{peer.handle}</span>
          )}
          {convo.muted && (
            <span class='text-xs rounded-full bg-sand-light dark:bg-gray-700 px-2 py-0.5 text-charcoal-light dark:text-gray-300 flex-shrink-0'>
              ミュート中
            </span>
          )}
        </span>
        <span
          class={`block mt-1 text-sm truncate ${
            convo.unreadCount > 0
              ? 'font-semibold text-charcoal dark:text-white'
              : 'text-charcoal-light dark:text-gray-400'
          }`}
        >
          {lastMessageSummary(convo.lastMessage)}
        </span>
      </span>
      <span class='flex flex-col items-end gap-1 flex-shrink-0'>
        {sentAt !== null && (
          <time
            dateTime={new Date(sentAt).toISOString()}
            class='text-xs text-charcoal-light dark:text-gray-400'
          >
            {formatChatTime(sentAt, now)}
          </time>
        )}
        {convo.unreadCount > 0 && (
          <span
            aria-label='未読のメッセージ'
            class='min-w-[1.25rem] h-5 px-1.5 rounded-full bg-terracotta text-white text-xs font-bold leading-5 text-center'
          >
            {convo.unreadCount}
          </span>
        )}
      </span>
    </a>
  );
};
