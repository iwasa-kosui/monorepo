import type { ReportParams } from '../api/mastodonClient.ts';
import type { ReportCategory } from '../components/ReportModal.tsx';

export type ReportPostTarget = Readonly<{
  accountId: string;
  acct: string;
  statusId: string;
}>;

export const reportPostParams = (
  target: ReportPostTarget,
  { category, comment }: Readonly<{ category: ReportCategory; comment: string }>,
): ReportParams => ({
  account_id: target.accountId,
  category: category === 'offensive' ? 'violation' : category,
  comment,
  status_ids: [target.statusId],
});
