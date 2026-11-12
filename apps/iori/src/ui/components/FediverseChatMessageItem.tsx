import type { Status } from '../../adaptor/mastodon/entities.ts';
import { safeUrl } from '../../helper/safeUrl.ts';
import { formatChatTime } from '../hooks/blueskyChat.ts';
import { fediverseMessageDisclosure } from '../hooks/fediverseConversation.ts';

type Props = Readonly<{ message: Status; own: boolean; now: number }>;

const contentClass =
  'text-charcoal dark:text-gray-100 prose dark:prose-invert prose-sm max-w-none [&_a]:text-terracotta dark:[&_a]:text-terracotta-light hover:[&_a]:underline break-words [&_p]:mb-2 [&_p:last-child]:mb-0 [&_.invisible]:visible';

const Attachments = ({ message }: Readonly<{ message: Status }>) => {
  const images = message.media_attachments.filter((attachment) => attachment.type === 'image');
  const playables = message.media_attachments.filter((attachment) =>
    attachment.type === 'video' || attachment.type === 'audio'
  );
  return (
    <>
      {images.length > 0 && (
        <div class='mt-2 grid gap-2 grid-cols-1' data-testid='fediverse-chat-images'>
          {images.map((image, index) => {
            const imageUrl = safeUrl(image.url);
            if (imageUrl === undefined) return null;
            return (
              <a
                key={index}
                href={imageUrl}
                target='_blank'
                rel='noopener noreferrer'
                class='block overflow-hidden rounded-xl'
              >
                <img
                  src={imageUrl}
                  alt={image.description || '添付画像'}
                  class='w-full h-auto max-h-64 object-cover'
                  loading='lazy'
                />
              </a>
            );
          })}
        </div>
      )}
      {playables.length > 0 && (
        <div class='mt-2 space-y-2'>
          {playables.map((attachment, index) => {
            const mediaUrl = safeUrl(attachment.url);
            if (mediaUrl === undefined) return null;
            return attachment.type === 'video'
              ? (
                <video
                  key={index}
                  src={mediaUrl}
                  aria-label={attachment.description || '動画'}
                  controls
                  preload='metadata'
                  playsinline
                  class='block w-full h-auto max-h-64 rounded-xl bg-black'
                />
              )
              : (
                <audio
                  key={index}
                  src={mediaUrl}
                  aria-label={attachment.description || '音声'}
                  controls
                  preload='metadata'
                  class='block w-full'
                />
              );
          })}
        </div>
      )}
    </>
  );
};

const Body = ({ message }: Readonly<{ message: Status }>) => {
  const { spoiler, concealsMedia } = fediverseMessageDisclosure(message);
  const shown = (
    <>
      <div class={contentClass} dangerouslySetInnerHTML={{ __html: message.content }} />
      {concealsMedia
        ? (
          <details class='mt-2'>
            <summary class='cursor-pointer text-sm text-terracotta dark:text-terracotta-light'>
              センシティブなメディアを表示
            </summary>
            <Attachments message={message} />
          </details>
        )
        : <Attachments message={message} />}
    </>
  );
  if (spoiler === null) return shown;
  return (
    <details data-testid='fediverse-chat-spoiler'>
      <summary class='cursor-pointer text-sm text-charcoal dark:text-gray-200 break-words'>
        {spoiler}（もっと見る）
      </summary>
      <div class='mt-2'>{shown}</div>
    </details>
  );
};

export const FediverseChatMessageItem = ({ message, own, now }: Props) => {
  const sentAt = Date.parse(message.created_at);
  return (
    <li class={`flex ${own ? 'justify-end' : 'justify-start'}`} data-testid='fediverse-chat-message'>
      <div class={`max-w-[85%] min-w-0 ${own ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          class={`rounded-clay px-4 py-2 shadow-clay-sm dark:shadow-clay-dark min-w-0 max-w-full ${
            own ? 'bg-sage/20 dark:bg-sage/25' : 'bg-cream dark:bg-gray-800'
          }`}
        >
          <Body message={message} />
        </div>
        {Number.isNaN(sentAt) ? null : (
          <time
            dateTime={new Date(sentAt).toISOString()}
            class='mt-1 text-xs text-charcoal-light dark:text-gray-400'
          >
            {formatChatTime(sentAt, now)}
          </time>
        )}
      </div>
    </li>
  );
};
