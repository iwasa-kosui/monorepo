import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';
import { isLocalAccount, statusHref } from '../api/status.ts';
import { splitSummaryCitations, type SummaryCitation } from '../api/summary.ts';

type Props = Readonly<{
  summary: string;
  citations: readonly SummaryCitation[];
}>;

export const SummaryText = ({ summary, citations }: Props) => (
  <p class='whitespace-pre-wrap break-words text-charcoal dark:text-gray-100'>
    {splitSummaryCitations(summary, citations).map((segment) => {
      if (segment.type === 'text') return segment.text;
      const href = isLocalAccount(segment.status.account)
        ? statusHref(segment.status)
        : safeAbsoluteUrl(statusHref(segment.status));
      return href === undefined
        ? String(segment.n)
        : <a href={href} class='text-terracotta hover:underline'>{segment.n}</a>;
    })}
  </p>
);
