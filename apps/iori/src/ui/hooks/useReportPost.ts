import { useCallback, useEffect, useState } from 'hono/jsx';

import { failureMessage, report } from '../api/mastodonClient.ts';
import type { ReportCategory } from '../components/ReportModal.tsx';
import { reportPostParams, type ReportPostTarget } from './reportPostParams.ts';

const REPORTED_NOTICE_MS = 4000;

export type UseReportPostReturn = Readonly<{
  target: ReportPostTarget | null;
  isReporting: boolean;
  isReported: boolean;
  error: string | undefined;
  open: (target: ReportPostTarget) => void;
  close: () => void;
  submit: (input: { category: ReportCategory; comment: string }) => Promise<void>;
}>;

export const useReportPost = (): UseReportPostReturn => {
  const [target, setTarget] = useState<ReportPostTarget | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [isReported, setIsReported] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isReported) return;
    const timer = setTimeout(() => setIsReported(false), REPORTED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [isReported]);

  const open = useCallback((next: ReportPostTarget) => {
    setError(undefined);
    setTarget(next);
  }, []);

  const close = useCallback(() => {
    if (isReporting) return;
    setTarget(null);
    setError(undefined);
  }, [isReporting]);

  const submit = useCallback(
    async (input: { category: ReportCategory; comment: string }) => {
      if (target === null) return;
      setIsReporting(true);
      setError(undefined);
      try {
        await report(reportPostParams(target, input));
        setTarget(null);
        setIsReported(true);
      } catch (cause) {
        console.error('Failed to report:', cause);
        setError(failureMessage('report', cause));
      } finally {
        setIsReporting(false);
      }
    },
    [target],
  );

  return { target, isReporting, isReported, error, open, close, submit } as const;
};
