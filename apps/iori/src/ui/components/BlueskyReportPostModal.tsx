import type { BlueskyReportDialog } from '../hooks/useBlueskyAuthorModeration.ts';
import { ReportModal } from './ReportModal.tsx';

const NOTICE_CLASS =
  'fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-clay bg-cream dark:bg-gray-800 shadow-clay dark:shadow-clay-dark text-sm text-sage-dark dark:text-sage';

export const BlueskyReportPostModal = (
  { reportDialog, notice }: Readonly<{ reportDialog: BlueskyReportDialog; notice?: string }>,
) => (
  <>
    <ReportModal
      targetLabel={reportDialog.target === null ? '' : `@${reportDialog.target.authorHandle} の投稿`}
      isOpen={reportDialog.target !== null}
      isSubmitting={reportDialog.isReporting}
      {...(reportDialog.error === undefined ? {} : { error: reportDialog.error })}
      onSubmit={reportDialog.submit}
      onClose={reportDialog.close}
    />
    {reportDialog.isReported && (
      <p role='status' class={NOTICE_CLASS}>
        通報しました
      </p>
    )}
    {notice !== undefined && (
      <p role='status' class={NOTICE_CLASS}>
        {notice}
      </p>
    )}
  </>
);
