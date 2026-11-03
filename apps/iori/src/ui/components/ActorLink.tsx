import type { Account } from '../../adaptor/mastodon/entities.ts';
import { accountHandle, isLocalAccount } from '../api/status.ts';

export const ActorLink = ({ account }: { account: Account }) => {
  const handle = accountHandle(account);

  return (
    <a
      href={isLocalAccount(account) ? account.uri : `/remote-users/${account.id}`}
      class='flex items-center gap-2 p-2 rounded-xl hover:bg-sand-light dark:hover:bg-gray-700 transition-colors'
    >
      <div class='w-8 h-8 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 shadow-clay-sm'>
        {account.avatar
          ? (
            <img
              src={account.avatar}
              alt='Actor Logo'
              class='w-8 h-8 rounded-full object-cover'
            />
          )
          : (
            handle.charAt(0).toUpperCase()
          )}
      </div>
      <span class='text-sm text-charcoal dark:text-gray-300 truncate'>
        {handle}
      </span>
    </a>
  );
};
