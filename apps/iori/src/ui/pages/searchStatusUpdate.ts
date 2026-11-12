import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { SearchStatusesResult, TimelineSummary } from '../api/mastodonClient.ts';
import { displayStatus, updateStatusesByPostId } from '../api/status.ts';

type StatusUpdater = (status: Status) => Status;

export type SearchSummary = Readonly<{ result: TimelineSummary; target: string }>;

export const updateSearchedStatuses = (
  searched: SearchStatusesResult | null,
  postId: string,
  updater: StatusUpdater,
): SearchStatusesResult | null =>
  searched === null ? null : { ...searched, statuses: [...updateStatusesByPostId(searched.statuses, postId, updater)] };

export const updateSummaryCitations = <T extends SearchSummary>(
  summary: T | null,
  postId: string,
  updater: StatusUpdater,
): T | null =>
  summary === null ? null : {
    ...summary,
    result: {
      ...summary.result,
      citations: summary.result.citations.map((citation) =>
        displayStatus(citation.status).id === postId ? { ...citation, status: updater(citation.status) } : citation
      ),
    },
  };
