import type { Child } from 'hono/jsx';

import type {
  IoriInteractionAccount,
  IoriStatusInteractionsResponse,
} from '../../adaptor/routes/workerIoriActionsRouter.ts';
import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';
import { hasInteractions, interactionAccountLink } from './postInteractions.ts';

const rowClass = 'flex items-center gap-2 min-w-0 rounded-clay px-2 py-1';

const AccountRow = ({ account }: Readonly<{ account: IoriInteractionAccount }>) => {
  const avatar = safeAbsoluteUrl(account.avatar);
  const link = interactionAccountLink(account);
  const body = (
    <>
      <span class='w-7 h-7 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 overflow-hidden'>
        {avatar === undefined
          ? account.acct.charAt(0).toUpperCase()
          : <img src={avatar} alt='' class='w-7 h-7 blob-avatar object-cover' loading='lazy' />}
      </span>
      <span class='min-w-0 flex flex-wrap items-baseline gap-x-2'>
        <span class='text-sm font-semibold text-charcoal dark:text-white truncate'>{account.display_name}</span>
        <span class='text-xs text-charcoal-light dark:text-gray-400 truncate'>@{account.acct}</span>
      </span>
    </>
  );
  return (
    <li>
      {link === undefined
        ? <span class={rowClass}>{body}</span>
        : (
          <a
            href={link.href}
            {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            class={`${rowClass} hover:bg-sand-light dark:hover:bg-gray-700 transition-colors`}
          >
            {body}
          </a>
        )}
    </li>
  );
};

const Group = (
  { label, accounts }: Readonly<{ label: Child; accounts: readonly IoriInteractionAccount[] }>,
) =>
  accounts.length === 0 ? null : (
    <details class='group'>
      <summary class='cursor-pointer select-none inline-flex items-center gap-1 px-3 py-1 text-sm rounded-full bg-sand-light dark:bg-gray-700 text-charcoal dark:text-gray-200 hover:bg-terracotta-light/20 dark:hover:bg-terracotta-dark/20 transition-colors'>
        {label}
        <span class='text-xs'>{accounts.length}</span>
      </summary>
      <ul class='mt-2 mb-1 space-y-0.5'>
        {accounts.map((account) => <AccountRow key={`${account.acct}`} account={account} />)}
      </ul>
    </details>
  );

type Props = Readonly<{ interactions: IoriStatusInteractionsResponse | null }>;

export const PostInteractionsView = ({ interactions }: Props) => {
  if (interactions === null || !hasInteractions(interactions)) return null;
  return (
    <section aria-label='この投稿への反応' class='mt-3 space-y-2'>
      <Group label='リポスト' accounts={interactions.reblogged_by} />
      <Group label='いいね' accounts={interactions.favourited_by} />
      {interactions.reactions.map((reaction) => {
        const emojiUrl = safeAbsoluteUrl(reaction.url);
        return (
          <Group
            key={reaction.name}
            label={emojiUrl === undefined
              ? reaction.name
              : <img src={emojiUrl} alt={reaction.name} title={reaction.name} class='w-4 h-4 object-contain' />}
            accounts={reaction.accounts}
          />
        );
      })}
    </section>
  );
};
