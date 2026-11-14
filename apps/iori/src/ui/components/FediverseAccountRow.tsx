import type { Account } from '../../adaptor/mastodon/entities.ts';
import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';
import { accountHandle, accountHref } from '../api/status.ts';
import { CustomEmojiText } from './CustomEmojiText.tsx';

const NOTE_MAX_LENGTH = 120;

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** プロフィール文の HTML を、一覧に出す短い平文にする。 */
export const accountNoteExcerpt = (note: string): string => {
  const text = note
    .replace(/<br\s*\/?>|<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, name: string) => {
      if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
      if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
      return ENTITIES[name.toLowerCase()] ?? entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
  const chars = [...text];
  return chars.length > NOTE_MAX_LENGTH ? `${chars.slice(0, NOTE_MAX_LENGTH).join('')}…` : text;
};

type Props = Readonly<{ account: Account }>;

export const FediverseAccountRow = ({ account }: Props) => {
  const avatar = safeAbsoluteUrl(account.avatar);
  const handle = accountHandle(account);
  const displayName = account.display_name.trim() === '' ? account.username : account.display_name;
  const excerpt = accountNoteExcerpt(account.note);
  return (
    <a
      href={accountHref(account)}
      class='flex items-start gap-3 bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-4 hover:bg-sand-light dark:hover:bg-gray-700 transition-colors'
    >
      <span class='w-10 h-10 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 shadow-clay-sm overflow-hidden'>
        {avatar === undefined
          ? handle.charAt(0).toUpperCase()
          : <img src={avatar} alt='' class='w-10 h-10 blob-avatar object-cover' loading='lazy' />}
      </span>
      <span class='min-w-0 flex-1'>
        <span class='flex flex-wrap items-baseline gap-x-2'>
          <span class='font-semibold text-charcoal dark:text-white truncate'>
            <CustomEmojiText text={displayName} emojis={account.emojis} />
          </span>
          <span class='text-sm text-charcoal-light dark:text-gray-400 truncate'>@{handle}</span>
        </span>
        {excerpt !== '' && (
          <span class='block mt-1 text-sm text-charcoal dark:text-gray-100 break-words'>{excerpt}</span>
        )}
      </span>
    </a>
  );
};
