import { useRef, useState } from 'hono/jsx';

import type { IoriBlueskyActorBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { blueskyFollowFailureMessage, followBlueskyActor, unfollowBlueskyActor } from '../api/blueskyProfileClient.ts';
import { BlueskyActorRow } from './BlueskyActorRow.tsx';

type Props = Readonly<{ actor: IoriBlueskyActorBody; href: string; viewerDid: string }>;

const FOLLOWING_BUTTON_CLASS =
  'flex items-center justify-center p-2 rounded-xl text-sage-dark dark:text-sage hover:bg-sand-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50';
const NOT_FOLLOWING_BUTTON_CLASS =
  'flex items-center justify-center p-2 rounded-xl text-charcoal-light dark:text-gray-400 hover:text-sage-dark dark:hover:text-sage hover:bg-sand-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50';

type FollowButtonProps = Readonly<{
  following: boolean;
  disabled: boolean;
  onClick: () => unknown;
}>;

export const BlueskyFollowButton = ({ following, disabled, onClick }: FollowButtonProps) => {
  const label = following ? 'フォロー解除' : 'フォロー';
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      class={following ? FOLLOWING_BUTTON_CLASS : NOT_FOLLOWING_BUTTON_CLASS}
      title={label}
      aria-label={label}
    >
      <svg
        xmlns='http://www.w3.org/2000/svg'
        class='h-5 w-5'
        fill='none'
        viewBox='0 0 24 24'
        stroke='currentColor'
        stroke-width='2'
      >
        <path
          stroke-linecap='round'
          stroke-linejoin='round'
          d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
        />
        {following
          ? <path stroke-linecap='round' stroke-linejoin='round' d='M15 11l2 2 4-4' />
          : <path stroke-linecap='round' stroke-linejoin='round' d='M19 10h-2m-2 0h2m0 0V8m0 2v2' />}
      </svg>
    </button>
  );
};

export const BlueskyFollowListRow = ({ actor, href, viewerDid }: Props) => {
  const [following, setFollowing] = useState(actor.followedByMe);
  const [followUri, setFollowUri] = useState<string | undefined>(undefined);
  const [isToggling, setIsToggling] = useState(false);
  const isTogglingRef = useRef(false);

  const toggle = async () => {
    if (isTogglingRef.current) return;
    isTogglingRef.current = true;
    setIsToggling(true);
    try {
      if (following) {
        await unfollowBlueskyActor(actor.did, followUri);
        setFollowUri(undefined);
        setFollowing(false);
      } else {
        const result = await followBlueskyActor(actor.did, followUri);
        setFollowUri(result.followUri);
        setFollowing(true);
      }
    } catch (error) {
      console.error(following ? 'Failed to unfollow:' : 'Failed to follow:', error);
      alert(blueskyFollowFailureMessage(error));
    } finally {
      isTogglingRef.current = false;
      setIsToggling(false);
    }
  };

  if (actor.did === viewerDid) return <BlueskyActorRow actor={actor} href={href} />;
  return (
    <BlueskyActorRow
      actor={actor}
      href={href}
      trailing={<BlueskyFollowButton following={following} disabled={isToggling} onClick={toggle} />}
    />
  );
};
