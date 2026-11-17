import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import type { ActorIdResolverByAcct } from '../../../domain/actor/accountRelationship.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import { createWorkerActorHandleRouter } from '../workerActorHandleRouter.ts';

const localActorId = ActorId.generate();
const remoteActorId = ActorId.generate();

const actorIdResolverByAcct: ActorIdResolverByAcct = {
  resolve: (lookup) => {
    if (lookup.type === 'local') {
      return RA.ok(lookup.username === 'kosui' || lookup.username === 'local.example' ? localActorId : undefined);
    }
    return RA.ok(lookup.username === 'test' && lookup.host === 'example.com' ? remoteActorId : undefined);
  },
};

const get = (path: string) =>
  new Hono().route('/', createWorkerActorHandleRouter({ actorIdResolverByAcct })).request(`https://blog.test${path}`);

describe('createWorkerActorHandleRouter', () => {
  it.each([
    ['/@kosui', '/users/kosui'],
    ['/@kosui/', '/users/kosui'],
    ['/@kosui@blog.test', '/users/kosui'],
    ['/@kosui@BLOG.TEST', '/users/kosui'],
    ['/@test@example.com', `/remote-users/${remoteActorId}`],
    ['/@test@Example.COM', `/remote-users/${remoteActorId}`],
    ['/@test@example.com?tab=media', `/remote-users/${remoteActorId}?tab=media`],
    ['/@alice.bsky.social', '/bluesky/profile/alice.bsky.social'],
    ['/@alice.bsky.social/', '/bluesky/profile/alice.bsky.social'],
    ['/@did:plc:abc123', '/bluesky/profile/did%3Aplc%3Aabc123'],
    ['/@local.example', '/users/local.example'],
  ])('redirects %s to the profile page %s', async (path, location) => {
    const response = await get(path);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(location);
  });

  it.each([
    '/@nobody',
    '/@nobody@example.com',
    '/@test@other.example',
    '/@test@example.com@extra',
    '/@test@',
    '/@',
    '/@handle.invalid',
    '/@-bad.example',
    '/@alice.bsky.social@unknown.example',
    '/@kosui/1',
    '/kosui',
  ])('does not redirect %s', async (path) => {
    expect((await get(path)).status).toBe(404);
  });
});
