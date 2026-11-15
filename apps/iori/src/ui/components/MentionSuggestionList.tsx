import type { Account } from '../../adaptor/mastodon/entities.ts';
import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';
import { accountHandle } from '../api/status.ts';
import { CustomEmojiText } from './CustomEmojiText.tsx';

type Props = Readonly<{
  id: string;
  accounts: readonly Account[];
  activeIndex: number;
  placement: 'above' | 'below';
  onSelect: (account: Account) => void;
  onHover: (index: number) => void;
}>;

export const mentionOptionId = (listId: string, index: number): string => `${listId}-option-${index}`;

export const MentionSuggestionList = ({ id, accounts, activeIndex, placement, onSelect, onHover }: Props) => (
  <ul
    id={id}
    role='listbox'
    aria-label='メンションの候補'
    class={`absolute left-2 right-2 z-50 max-h-64 overflow-y-auto rounded-clay bg-cream dark:bg-gray-800 shadow-clay dark:shadow-clay-dark border border-warm-gray-dark dark:border-gray-600 py-1 ${
      placement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
    }`}
  >
    {accounts.map((account, index) => {
      const avatar = safeAbsoluteUrl(account.avatar);
      const handle = accountHandle(account);
      const displayName = account.display_name.trim() === '' ? account.username : account.display_name;
      const active = index === activeIndex;
      return (
        <li
          key={account.id}
          id={mentionOptionId(id, index)}
          role='option'
          aria-selected={active}
          // textarea のフォーカスを奪わないよう、クリックは mousedown で受けて既定の動作を止める
          onMouseDown={(e: MouseEvent) => {
            e.preventDefault();
            onSelect(account);
          }}
          onMouseEnter={() => onHover(index)}
          class={`flex items-center gap-2 px-3 py-1.5 cursor-pointer ${active ? 'bg-sand-light dark:bg-gray-700' : ''}`}
        >
          <span class='w-7 h-7 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 overflow-hidden'>
            {avatar === undefined
              ? handle.charAt(0).toUpperCase()
              : <img src={avatar} alt='' class='w-7 h-7 blob-avatar object-cover' loading='lazy' />}
          </span>
          <span class='min-w-0 flex-1'>
            <span class='block text-sm font-semibold text-charcoal dark:text-white truncate'>
              <CustomEmojiText text={displayName} emojis={account.emojis} />
            </span>
            <span class='block text-xs text-charcoal-light dark:text-gray-400 truncate'>@{handle}</span>
          </span>
        </li>
      );
    })}
  </ul>
);
