import type {
  IoriInteractionAccount,
  IoriStatusInteractionsResponse,
} from '../../adaptor/routes/workerIoriActionsRouter.ts';
import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';

export type InteractionAccountLink = Readonly<{ href: string; external: boolean }>;

export const interactionAccountLink = (account: IoriInteractionAccount): InteractionAccountLink | undefined => {
  if (account.local) return { href: `/users/${encodeURIComponent(account.acct)}`, external: false };
  if (account.id !== null) return { href: `/remote-users/${encodeURIComponent(account.id)}`, external: false };
  const url = safeAbsoluteUrl(account.url);
  return url === undefined ? undefined : { href: url, external: true };
};

export const hasInteractions = (interactions: IoriStatusInteractionsResponse | null): boolean =>
  interactions !== null
  && (interactions.favourited_by.length > 0
    || interactions.reblogged_by.length > 0
    || interactions.reactions.length > 0);
