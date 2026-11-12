import { useState } from 'hono/jsx';

import type { Poll } from '../../adaptor/mastodon/entities.ts';
import { failureMessage } from '../api/mastodonClient.ts';

type Props = Readonly<{
  poll: Poll;
  onVote?: (choices: readonly number[]) => Promise<void>;
}>;

export const pollPercent = (votesCount: number, totalVotes: number): number =>
  totalVotes <= 0 ? 0 : Math.round((votesCount / totalVotes) * 100);

const pollDeadlineLabel = (poll: Poll): string | null => {
  if (poll.expired) return '終了';
  if (poll.expires_at === null) return null;
  const expiresAt = new Date(poll.expires_at);
  return Number.isNaN(expiresAt.getTime()) ? null : `${expiresAt.toLocaleString('ja-JP')} まで`;
};

const stopPropagation = (event: Event) => event.stopPropagation();

export const castVote = async (
  onVote: (choices: readonly number[]) => Promise<void>,
  choices: readonly number[],
): Promise<string | undefined> => {
  try {
    await onVote(choices);
    return undefined;
  } catch (error) {
    console.error('Failed to vote:', error);
    return failureMessage('vote', error);
  }
};

export const PollView = ({ poll, onVote }: Props) => {
  const [selected, setSelected] = useState<readonly number[]>([]);
  const [isVoting, setIsVoting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const deadline = pollDeadlineLabel(poll);
  const summary = (
    <p class='text-xs text-charcoal-light dark:text-gray-400'>
      {poll.votes_count} 票{deadline === null ? '' : ` ・ ${deadline}`}
    </p>
  );

  if (onVote !== undefined && !poll.voted && !poll.expired) {
    const toggle = (index: number) =>
      setSelected(
        !poll.multiple
          ? [index]
          : selected.includes(index)
          ? selected.filter((choice) => choice !== index)
          : [...selected, index],
      );
    const submit = async () => {
      if (selected.length === 0 || isVoting) return;
      setIsVoting(true);
      setError(undefined);
      setError(await castVote(onVote, selected));
      setIsVoting(false);
    };
    return (
      <form
        class='mt-3 space-y-2'
        data-poll
        data-poll-form
        onSubmit={(event: Event) => {
          event.preventDefault();
          void submit();
        }}
        onClick={stopPropagation}
        onTouchStart={stopPropagation}
        onTouchEnd={stopPropagation}
      >
        <fieldset class='space-y-2' disabled={isVoting}>
          <legend class='sr-only'>投票</legend>
          {poll.options.map((option, index) => (
            <label
              key={`${option.title}#${index}`}
              class='flex cursor-pointer items-center gap-2 rounded-xl bg-sand/40 px-3 py-2 text-sm text-charcoal dark:bg-gray-700/40 dark:text-gray-200'
            >
              <input
                type={poll.multiple ? 'checkbox' : 'radio'}
                name={`poll-${poll.id}`}
                value={index}
                checked={selected.includes(index)}
                onChange={() => toggle(index)}
                class='accent-terracotta'
              />
              <span class='min-w-0 break-words'>{option.title}</span>
            </label>
          ))}
        </fieldset>
        <button
          type='submit'
          disabled={selected.length === 0 || isVoting}
          class='rounded-xl bg-terracotta px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50'
        >
          投票する
        </button>
        {error !== undefined && <p role='alert' class='text-sm text-terracotta dark:text-terracotta-light'>{error}</p>}
        {summary}
      </form>
    );
  }

  return (
    <div class='mt-3 space-y-2' data-poll>
      <ul class='space-y-2'>
        {poll.options.map((option, index) => {
          const percent = pollPercent(option.votes_count ?? 0, poll.votes_count);
          const isOwnVote = poll.own_votes.includes(index);
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
                <span class='min-w-0 break-words'>
                  {isOwnVote && (
                    <span data-poll-own-vote aria-label='自分が選んだ選択肢' class='mr-1 font-bold'>✓</span>
                  )}
                  {option.title}
                </span>
                <span class='flex-shrink-0 font-semibold'>{percent}%</span>
              </div>
            </li>
          );
        })}
      </ul>
      {summary}
    </div>
  );
};
