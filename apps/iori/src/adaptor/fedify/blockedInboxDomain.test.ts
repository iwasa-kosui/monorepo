import type { Federation } from '@fedify/fedify';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { federationWithObjectNotFound } from './activityPubObjectNotFound.ts';
import { findBlockedInboxDomain, isBlockedHost } from './blockedInboxDomain.ts';

const relayedCreate = (author: string) => ({
  '@context': 'https://www.w3.org/ns/activitystreams',
  id: `${author}/statuses/1/activity`,
  type: 'Create',
  actor: author,
  object: { id: `${author}/statuses/1`, type: 'Note', attributedTo: author },
  signature: { type: 'RsaSignature2017', creator: `${author}#main-key` },
});

const relayedAnnounce = (author: string) => ({
  '@context': 'https://www.w3.org/ns/activitystreams',
  id: 'https://relay.example/activities/1',
  type: 'Announce',
  actor: 'https://relay.example/actor',
  object: `${author}/statuses/1`,
});

describe('isBlockedHost', () => {
  it('blocks the domain itself and its subdomains, ignoring case', () => {
    expect(isBlockedHost('crazylab.online', 'crazylab.online')).toBe(true);
    expect(isBlockedHost('media.crazylab.online', 'crazylab.online')).toBe(true);
    expect(isBlockedHost('CrazyLab.Online', 'crazylab.online')).toBe(true);
  });

  it('blocks an id whose hostname ends with a trailing dot', () => {
    expect(findBlockedInboxDomain({ type: 'Create', actor: 'https://crazylab.online./users/a' })).toBe(
      'crazylab.online',
    );
  });

  it('does not block a different domain that only shares the tail', () => {
    expect(isBlockedHost('notcrazylab.online', 'crazylab.online')).toBe(false);
    expect(isBlockedHost('crazylab.online.example', 'crazylab.online')).toBe(false);
    expect(isBlockedHost('online', 'crazylab.online')).toBe(false);
  });
});

describe('findBlockedInboxDomain', () => {
  it('finds the domain in actor, object, object.attributedTo, or signature.creator', () => {
    const author = 'https://crazylab.online/users/a';
    expect(findBlockedInboxDomain({ type: 'Create', actor: author })).toBe('crazylab.online');
    expect(findBlockedInboxDomain(relayedAnnounce(author))).toBe('crazylab.online');
    expect(
      findBlockedInboxDomain({
        type: 'Create',
        actor: 'https://relay.example/actor',
        object: { id: 'https://relay.example/o', attributedTo: author },
      }),
    ).toBe('crazylab.online');
    expect(
      findBlockedInboxDomain({
        type: 'Create',
        actor: 'https://relay.example/actor',
        signature: { creator: `${author}#main-key` },
      }),
    ).toBe('crazylab.online');
  });

  it('returns undefined for other domains and for values that are not activities', () => {
    expect(findBlockedInboxDomain(relayedCreate('https://notcrazylab.online/users/a'))).toBeUndefined();
    expect(findBlockedInboxDomain(relayedCreate('https://mastodon.example/users/a'))).toBeUndefined();
    expect(findBlockedInboxDomain(undefined)).toBeUndefined();
    expect(findBlockedInboxDomain('not an object')).toBeUndefined();
    expect(findBlockedInboxDomain({ actor: 'not a url' })).toBeUndefined();
  });
});

describe('federationWithObjectNotFound with blocked inbox domains', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setup = () => {
    const fetch = vi.fn(async () => new Response('federated', { status: 202 }));
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const app = new Hono();
    app.use('*', federationWithObjectNotFound({ fetch } as unknown as Federation<void>, () => undefined));
    app.all('*', (c) => c.text('next'));
    const post = (path: string, body: string) =>
      app.request(`https://iori.example${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/activity+json' },
        body,
      });
    return { fetch, info, post };
  };

  it.each([
    [
      'a relayed Create to the shared inbox',
      '/inbox',
      relayedCreate('https://crazylab.online/users/a'),
      'crazylab.online',
    ],
    [
      'a relayed Announce to the shared inbox',
      '/inbox',
      relayedAnnounce('https://crazylab.online/users/a'),
      'crazylab.online',
    ],
    [
      'a Create to a personal inbox',
      '/users/kosui/inbox',
      relayedCreate('https://crazylab.online/users/a'),
      'crazylab.online',
    ],
  ])('answers 202 without passing %s to Fedify', async (_label, path, activity, domain) => {
    const { fetch, info, post } = setup();

    const response = await post(path, JSON.stringify(activity));

    expect(response.status).toBe(202);
    expect(fetch).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('iori inbox: dropped an activity from a blocked domain.', {
      domain,
      activityType: activity.type,
      path,
    });
  });

  it('passes an activity from a domain that only shares the tail to Fedify', async () => {
    const { fetch, info, post } = setup();

    await post('/inbox', JSON.stringify(relayedCreate('https://notcrazylab.online/users/a')));

    expect(fetch).toHaveBeenCalledOnce();
    expect(info).not.toHaveBeenCalled();
  });

  it('passes a body that is not JSON to Fedify with the body unread', async () => {
    const { fetch, post } = setup();

    await post('/inbox', 'not json');

    expect(fetch).toHaveBeenCalledOnce();
    const [request] = fetch.mock.calls[0] as unknown as [Request];
    expect(await request.text()).toBe('not json');
  });

  it('passes the body of an activity from an allowed domain to Fedify unread', async () => {
    const { fetch, post } = setup();
    const body = JSON.stringify(relayedCreate('https://mastodon.example/users/a'));

    await post('/inbox', body);

    const [request] = fetch.mock.calls[0] as unknown as [Request];
    expect(await request.text()).toBe(body);
  });
});
