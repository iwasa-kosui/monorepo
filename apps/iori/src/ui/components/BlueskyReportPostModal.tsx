import type { BlueskyReportDialog } from '../hooks/useBlueskyAuthorModeration.ts';
import { ReportModal } from './ReportModal.tsx';

export const BlueskyReportPostModal = ({ reportDialog }: Readonly<{ reportDialog: BlueskyReportDialog }>) => (
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
      <p
        role='status'
        class='fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-clay bg-cream dark:bg-gray-800 shadow-clay dark:shadow-clay-dark text-sm text-sage-dark dark:text-sage'
      >
        通報しました
      </p>
    )}
  </>
);
