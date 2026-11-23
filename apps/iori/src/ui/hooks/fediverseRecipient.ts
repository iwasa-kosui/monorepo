import type { Account } from '../../adaptor/mastodon/entities.ts';
import { BLUESKY_ACCOUNT_ID_PREFIX } from '../../adaptor/mastodon/toBlueskyAccount.ts';
import { accountHandle } from '../api/status.ts';

const REMOTE_HANDLE = /^([A-Za-z0-9_][A-Za-z0-9_.-]*)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/;

export const normalizeRecipientQuery = (input: string): string => input.trim().replace(/^@/, '');

export const resolvableRecipientHandle = (query: string): string | undefined =>
  REMOTE_HANDLE.test(query) ? query : undefined;

export const hasRecipientHandle = (candidates: readonly Account[], handle: string): boolean =>
  candidates.some((candidate) => accountHandle(candidate).toLowerCase() === handle.toLowerCase());

type CandidateInput = Readonly<{
  found: readonly Account[];
  resolved: Account | undefined;
  selfAccountId: string | undefined;
}>;

export const recipientCandidates = ({ found, resolved, selfAccountId }: CandidateInput): readonly Account[] => {
  const seen = new Set<string>();
  return [...found, ...(resolved === undefined ? [] : [resolved])].filter((account) => {
    if (account.id === selfAccountId || account.id.startsWith(BLUESKY_ACCOUNT_ID_PREFIX) || seen.has(account.id)) {
      return false;
    }
    seen.add(account.id);
    return true;
  });
};
