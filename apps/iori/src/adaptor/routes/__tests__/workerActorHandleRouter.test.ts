import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import type { ActorIdResolverByAcct } from '../../../domain/actor/accountRelationship.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { ResolveRemoteAccountUseCase } from '../../../useCase/resolveRemoteAccount.ts';
import { RemoteActorLookupError } from '../../fedify/remoteActorLookup.ts';
import { createWorkerActorHandleRouter } from '../workerActorHandleRouter.ts';

const localActorId = ActorId.generate();
const knownRemoteActorId = ActorId.generate();
const fetchedRemoteActorId = ActorId.generate();
const viewerUserId = UserId.generate();

const actorIdResolverByAcct: ActorIdResolverByAcct = {
  resolve: (lookup) => {
    if (lookup.type === 'local') return RA.ok(lookup.username === 'kosui' ? localActorId : undefined);
    return RA.ok(lookup.username === 'test' && lookup.host === 'example.com' ? knownRemoteActorId : undefined);
  },
};

const setUp = ({ loggedIn }: { loggedIn: boolean }) => {
  const fetchedHandles: string[] = [];
  const resolveRemoteAccountUseCase: ResolveRemoteAccountUseCase = {
    run: async ({ handle }) => {
      fetchedHandles.push(handle);
      return handle === 'new@fresh.example'
        ? RA.ok(fetchedRemoteActorId)
        : RA.err(RemoteActorLookupError.create(handle, 'not found'));
    },
  };
  const app = new Hono().route(
    '/',
    createWorkerActorHandleRouter({
      actorIdResolverByAcct,
      resolveRemoteAccountUseCase,
      viewerUserIdOf: async () => (loggedIn ? viewerUserId : undefined),
    }),
  );
  return { fetchedHandles, get: (path: string) => app.request(`https://blog.test${path}`) };
};

describe('createWorkerActorHandleRouter', () => {
  it.each([
    ['/@kosui@blog.test', '/users/kosui'],
    ['/@kosui@blog.test/', '/users/kosui'],
    ['/@kosui@BLOG.TEST', '/users/kosui'],
    ['/@test@example.com', `/remote-users/${knownRemoteActorId}`],
    ['/@test@Example.COM', `/remote-users/${knownRemoteActorId}`],
    ['/@test@example.com?tab=media', `/remote-users/${knownRemoteActorId}?tab=media`],
    ['/@alice.bsky.social', '/bluesky/profile/alice.bsky.social'],
    ['/@alice.bsky.social/', '/bluesky/profile/alice.bsky.social'],
    ['/@did:plc:abc123', '/bluesky/profile/did%3Aplc%3Aabc123'],
  ])('redirects %s to the profile page %s without asking the remote server', async (path, location) => {
    const t = setUp({ loggedIn: false });

    const response = await t.get(path);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(location);
    expect(t.fetchedHandles).toEqual([]);
  });

  it.each([
    '/@kosui',
    '/@nobody@blog.test',
    '/@test@example.com@extra',
    '/@test@',
    '/@',
    '/@handle.invalid',
    '/@-bad.example',
    '/@kosui@blog.test/1',
    '/kosui',
  ])('does not redirect %s', async (path) => {
    const t = setUp({ loggedIn: true });

    expect((await t.get(path)).status).toBe(404);
    expect(t.fetchedHandles).toEqual([]);
  });

  it('fetches an unknown remote actor for a logged-in viewer and redirects to its profile', async () => {
    const t = setUp({ loggedIn: true });

    const response = await t.get('/@new@Fresh.Example?tab=media');

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`/remote-users/${fetchedRemoteActorId}?tab=media`);
    expect(t.fetchedHandles).toEqual(['new@fresh.example']);
  });

  it('sends a logged-out viewer to sign in instead of fetching an unknown remote actor', async () => {
    const t = setUp({ loggedIn: false });

    const response = await t.get('/@new@fresh.example');

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/sign-in');
    expect(t.fetchedHandles).toEqual([]);
  });

  it('responds 404 when the remote actor cannot be fetched', async () => {
    const t = setUp({ loggedIn: true });

    expect((await t.get('/@ghost@fresh.example')).status).toBe(404);
  });

  it.each(['/@a%20b@fresh.example', '/@new@fresh.example:8443', '/@new@127.0.0.1%2Fadmin'])(
    'does not ask a remote server about the malformed handle %s',
    async (path) => {
      const t = setUp({ loggedIn: true });

      expect((await t.get(path)).status).toBe(404);
      expect(t.fetchedHandles).toEqual([]);
    },
  );
});
