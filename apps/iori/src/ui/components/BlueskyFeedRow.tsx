import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';
import { blueskyFeedLabel, type BlueskySavedFeedView } from '../api/blueskyFeedClient.ts';
import { blueskyFeedPagePath } from '../api/blueskyLinks.ts';
import { actorDescriptionExcerpt } from './BlueskyActorRow.tsx';

type Props = Readonly<{ feed: BlueskySavedFeedView }>;

export const BlueskyFeedRow = ({ feed }: Props) => {
  const label = blueskyFeedLabel(feed);
  const avatar = safeAbsoluteUrl(feed.avatar);
  const excerpt = actorDescriptionExcerpt(feed.description ?? null);
  return (
    <a
      href={blueskyFeedPagePath(feed.uri)}
      class='flex items-start gap-3 bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-4 hover:bg-sand-light dark:hover:bg-gray-700 transition-colors'
    >
      <span class='w-10 h-10 rounded-full bg-sand-light dark:bg-gray-700 text-charcoal dark:text-gray-200 flex items-center justify-center font-semibold text-sm flex-shrink-0 overflow-hidden'>
        {avatar === undefined
          ? label.charAt(0).toUpperCase()
          : <img src={avatar} alt='' class='w-10 h-10 rounded-full object-cover' loading='lazy' />}
      </span>
      <span class='min-w-0 flex-1'>
        <span class='flex flex-wrap items-baseline gap-x-2'>
          <span class='font-semibold text-charcoal dark:text-white truncate'>{label}</span>
          {feed.creatorHandle !== undefined && (
            <span class='text-sm text-charcoal-light dark:text-gray-400 truncate'>@{feed.creatorHandle}</span>
          )}
        </span>
        {excerpt !== '' && (
          <span class='block mt-1 text-sm text-charcoal dark:text-gray-100 break-words'>{excerpt}</span>
        )}
      </span>
    </a>
  );
};
