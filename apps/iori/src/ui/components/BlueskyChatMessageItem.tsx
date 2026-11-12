import type { IoriBlueskyChatMessageBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyChatSharedPost } from '../../domain/blueskyChat/blueskyChat.ts';
import { blueskyProfilePathOf, ioriBlueskyPostPath } from '../../helper/blueskyUrl.ts';
import { formatChatTime, groupReactions } from '../hooks/blueskyChat.ts';
import { BlueskyText } from './BlueskyTimelineItemView.tsx';

type Props = Readonly<{ message: IoriBlueskyChatMessageBody; own: boolean; now: number }>;

const mutedClass = 'text-charcoal-light dark:text-gray-400';

const SharedPostCard = ({ post }: Readonly<{ post: BlueskyChatSharedPost }>) => (
  <a
    href={ioriBlueskyPostPath(post.uri) ?? blueskyProfilePathOf(post.authorHandle)}
    data-testid='bluesky-chat-shared-post'
    class='block mt-2 rounded-xl border border-warm-gray dark:border-gray-600 bg-cream/60 dark:bg-gray-900/40 p-3 hover:bg-sand-light/50 dark:hover:bg-gray-700/50 transition-colors'
  >
    <span class={`block text-xs ${mutedClass} mb-1 truncate`}>
      {post.authorDisplayName === null ? '' : `${post.authorDisplayName} `}@{post.authorHandle}
    </span>
    <span class='block text-sm whitespace-pre-wrap break-words text-charcoal dark:text-gray-100'>{post.text}</span>
  </a>
);

const Body = ({ message }: Readonly<{ message: IoriBlueskyChatMessageBody }>) => {
  if (message.kind === 'deleted') return <p class={`italic ${mutedClass}`}>削除されたメッセージ</p>;
  if (message.kind === 'unsupported') return <p class={`italic ${mutedClass}`}>表示できないメッセージ</p>;
  const reactions = groupReactions(message.reactions);
  return (
    <>
      {message.text !== '' && <BlueskyText text={message.text} facets={message.facets} />}
      {message.sharedPost !== null && <SharedPostCard post={message.sharedPost} />}
      {reactions.length > 0 && (
        <div class='mt-2 flex flex-wrap gap-1' data-testid='bluesky-chat-reactions'>
          {reactions.map((reaction) => (
            <span class='rounded-full bg-cream dark:bg-gray-900/40 px-2 py-0.5 text-xs text-charcoal dark:text-gray-100'>
              {reaction.value}
              {reaction.count > 1 ? ` ${reaction.count}` : ''}
            </span>
          ))}
        </div>
      )}
    </>
  );
};

export const BlueskyChatMessageItem = ({ message, own, now }: Props) => {
  const sentAt = message.sentAt;
  return (
    <li class={`flex ${own ? 'justify-end' : 'justify-start'}`} data-testid='bluesky-chat-message'>
      <div class={`max-w-[85%] min-w-0 ${own ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          class={`rounded-clay px-4 py-2 shadow-clay-sm dark:shadow-clay-dark ${
            own ? 'bg-sage/20 dark:bg-sage/25' : 'bg-cream dark:bg-gray-800'
          }`}
        >
          <Body message={message} />
        </div>
        {sentAt !== null && (
          <time dateTime={new Date(sentAt).toISOString()} class={`mt-1 text-xs ${mutedClass}`}>
            {formatChatTime(sentAt, now)}
          </time>
        )}
      </div>
    </li>
  );
};
