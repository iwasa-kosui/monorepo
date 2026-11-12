import { detailHref } from '../api/status.ts';
import { normalizeSummaryMarkdown, splitSummaryCitations, type SummaryCitation } from '../api/summary.ts';

type Props = Readonly<{
  summary: string;
  citations: readonly SummaryCitation[];
}>;

export const SummaryText = ({ summary, citations }: Props) => (
  <p class='whitespace-pre-wrap break-words text-charcoal dark:text-gray-100'>
    {splitSummaryCitations(normalizeSummaryMarkdown(summary), citations).map((segment) => {
      if (segment.type === 'text') return segment.text;
      return <a href={detailHref(segment.status)} class='text-terracotta hover:underline'>{segment.n}</a>;
    })}
  </p>
);
