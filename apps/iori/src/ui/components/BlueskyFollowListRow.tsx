import { useRef, useState } from 'hono/jsx';

import type { IoriBlueskyActorBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { blueskyFollowFailureMessage, followBlueskyActor, unfollowBlueskyActor } from '../api/blueskyProfileClient.ts';
import { BlueskyActorRow } from './BlueskyActorRow.tsx';
import { FollowToggleButton } from './FollowToggleButton.tsx';

type Props = Readonly<{ actor: IoriBlueskyActorBody; href: string; viewerDid: string }>;

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
      trailing={<FollowToggleButton following={following} disabled={isToggling} onClick={toggle} />}
    />
  );
};
