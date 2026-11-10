import type { InboxRequestReport } from '@fedify/fedify';
import { Announce, Create, Note } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createOnRequestFinished } from './onRequestFinished.ts';

const relayId = '0b8f0f4e-6a0b-4c52-9d3a-0d6f1c9a7e11';
const ctx = {} as never;

const createReport = (
  activity: unknown = new Create({
    id: new URL('https://remote.example/activities/1'),
    actor: new URL('https://remote.example/users/alice'),
    object: new Note({ id: new URL('https://remote.example/notes/1') }),
  }),
) =>
  ({
    inbox: { kind: 'shared', recipient: null },
    payload: { status: 'unavailable' },
    activity,
    attempts: [],
    authentication: {
      status: 'rejected',
      reason: {
        type: 'actorKeyMismatch',
        key: {
          type: 'cryptographicKey',
          id: new URL('https://relay.example/actor#main-key'),
          ownerId: new URL('https://relay.example/actor'),
          publicKey: {},
        },
        actorIds: [],
      },
    },
    outcome: { type: 'response', status: 401, disposition: 'rejected', reason: 'authentication' },
  }) as unknown as InboxRequestReport;

const createDeps = (resolved: unknown) => {
  const relayResolverByActorUri = { resolve: vi.fn(async () => resolved as never) };
  const enqueue = vi.fn(async () => undefined);
  return { deps: { relayResolverByActorUri, enqueue }, relayResolverByActorUri, enqueue };
};

const relay = (status: string) => RA.ok({ relayId, status, actorUri: 'https://relay.example/actor' });

describe('createOnRequestFinished', () => {
  it('enqueues a refetch when the key belongs to an accepted relay', async () => {
    const { deps, relayResolverByActorUri, enqueue } = createDeps(relay('accepted'));

    await createOnRequestFinished(deps)(ctx, createReport());

    expect(relayResolverByActorUri.resolve).toHaveBeenCalledWith({ actorUri: 'https://relay.example/actor' });
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(ctx, {
      objectId: 'https://remote.example/notes/1',
      actorId: 'https://remote.example/users/alice',
      relayId,
    });
  });

  it('does not enqueue when no relay has the key owner as its actor', async () => {
    const { deps, enqueue } = createDeps(RA.ok(undefined));

    await createOnRequestFinished(deps)(ctx, createReport());

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue when the relay is pending', async () => {
    const { deps, enqueue } = createDeps(relay('pending'));

    await createOnRequestFinished(deps)(ctx, createReport());

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue when the relay is rejected', async () => {
    const { deps, enqueue } = createDeps(relay('rejected'));

    await createOnRequestFinished(deps)(ctx, createReport());

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue when the relay resolver returns an error', async () => {
    const { deps, enqueue } = createDeps(RA.err({ message: 'db down' }));

    await createOnRequestFinished(deps)(ctx, createReport());

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('does not resolve a relay when the report is not a rejected relay-forwarded Create', async () => {
    const { deps, relayResolverByActorUri, enqueue } = createDeps(relay('accepted'));
    const announce = new Announce({
      id: new URL('https://remote.example/activities/2'),
      actor: new URL('https://remote.example/users/alice'),
      object: new URL('https://remote.example/notes/1'),
    });

    await createOnRequestFinished(deps)(ctx, createReport(announce));

    expect(relayResolverByActorUri.resolve).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('does not throw when enqueue fails', async () => {
    const { deps, enqueue } = createDeps(relay('accepted'));
    enqueue.mockRejectedValue(new Error('queue down'));

    await expect(createOnRequestFinished(deps)(ctx, createReport())).resolves.toBeUndefined();
  });
});
