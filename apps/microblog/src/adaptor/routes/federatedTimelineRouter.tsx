import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

import { SessionId } from '../../domain/session/sessionId.ts';
import { Layout } from '../../layout.tsx';
import { FederatedTimelinePage } from '../../ui/pages/federatedTimeline.tsx';
import { GetFederatedTimelineUseCase } from '../../useCase/getFederatedTimeline.ts';
import { PgActorResolverByUserId } from '../pg/actor/actorResolverByUserId.ts';
import { PgFederatedTimelineItemsResolver } from '../pg/federatedTimeline/federatedTimelineItemsResolver.ts';
import { PgMutedActorIdsResolverByUserId } from '../pg/mute/mutedActorIdsResolverByUserId.ts';
import { PgAllRelaysResolver } from '../pg/relay/allRelaysResolver.ts';
import { PgSessionResolver } from '../pg/session/sessionResolver.ts';
import { PgUserResolver } from '../pg/user/userResolver.ts';
import { sanitize } from './helper/sanitize.ts';

const app = new Hono();

app.get('/', async (c) => {
  const sessionId = getCookie(c, 'sessionId');

  if (!sessionId) {
    // Not logged in - show empty page with sign in prompt
    return c.html(
      <FederatedTimelinePage items={[]} relays={[]} isLoggedIn={false} />,
    );
  }

  const sessionIdResult = SessionId.parse(sessionId);
  if (!sessionIdResult.ok) {
    return c.html(
      <FederatedTimelinePage items={[]} relays={[]} isLoggedIn={false} />,
    );
  }

  const useCase = GetFederatedTimelineUseCase.create({
    sessionResolver: PgSessionResolver.getInstance(),
    userResolver: PgUserResolver.getInstance(),
    actorResolverByUserId: PgActorResolverByUserId.getInstance(),
    federatedTimelineItemsResolver: PgFederatedTimelineItemsResolver.getInstance(),
    mutedActorIdsResolverByUserId: PgMutedActorIdsResolverByUserId.getInstance(),
  });

  const allRelaysResolver = PgAllRelaysResolver.getInstance();

  const [timelineResult, relaysResult] = await Promise.all([
    useCase.run({
      sessionId: sessionIdResult.val,
      receivedAt: undefined,
    }),
    allRelaysResolver.resolve(),
  ]);

  if (!timelineResult.ok) {
    return c.html(
      <Layout>
        <section>
          <h1>Error</h1>
          <p>Failed to load federated timeline</p>
        </section>
      </Layout>,
      500,
    );
  }

  const relays = relaysResult.ok ? relaysResult.val : [];

  return c.html(
    <FederatedTimelinePage
      items={timelineResult.val.items.map((item) => ({
        ...item,
        post: {
          ...item.post,
          content: sanitize(item.post.content),
        },
      }))}
      relays={relays}
      isLoggedIn={true}
    />,
  );
});

export { app as FederatedTimelineRouter };
