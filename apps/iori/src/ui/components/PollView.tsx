import type { Poll } from '../../adaptor/mastodon/entities.ts';

type Props = Readonly<{
  poll: Poll;
}>;

export const pollPercent = (votesCount: number, totalVotes: number): number =>
  totalVotes <= 0 ? 0 : Math.round((votesCount / totalVotes) * 100);

const pollDenominator = (poll: Poll): number =>
  poll.multiple && poll.voters_count !== null && poll.voters_count > 0 ? poll.voters_count : poll.votes_count;

const pollDeadlineLabel = (poll: Poll): string | null => {
  if (poll.expired) return '終了';
  if (poll.expires_at === null) return null;
  const expiresAt = new Date(poll.expires_at);
  return Number.isNaN(expiresAt.getTime()) ? null : `${expiresAt.toLocaleString('ja-JP')} まで`;
};

export const PollView = ({ poll }: Props) => {
  const deadline = pollDeadlineLabel(poll);
  const denominator = pollDenominator(poll);
  return (
    <div class='mt-3 space-y-2' data-poll>
      <ul class='space-y-2'>
        {poll.options.map((option, index) => {
          const percent = pollPercent(option.votes_count ?? 0, denominator);
          return (
            <li
              key={`${option.title}#${index}`}
              class='relative overflow-hidden rounded-xl bg-sand/40 px-3 py-2 dark:bg-gray-700/40'
            >
              <div
                aria-hidden='true'
                data-poll-bar
                class='absolute inset-y-0 left-0 bg-terracotta/30 dark:bg-terracotta-light/30'
                style={{ width: `${percent}%` }}
              />
              <div class='relative flex items-baseline justify-between gap-3 text-sm text-charcoal dark:text-gray-200'>
                <span class='min-w-0 break-words'>{option.title}</span>
                <span class='flex-shrink-0 font-semibold'>{percent}%</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p class='text-xs text-charcoal-light dark:text-gray-400'>
        {poll.votes_count} 票{deadline === null ? '' : ` ・ ${deadline}`}
      </p>
    </div>
  );
};
