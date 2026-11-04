import type { InboxRequestReport } from '@fedify/fedify';
import { Announce, Create, Note } from '@fedify/vocab';
import { describe, expect, it } from 'vitest';

import { extractRelayForwardedCreate } from './extractRelayForwardedCreate.ts';

const createActivity = (objectId = 'https://remote.example/notes/1') =>
  new Create({
    id: new URL('https://remote.example/activities/1'),
    actor: new URL('https://remote.example/users/alice'),
    object: new Note({ id: new URL(objectId) }),
  });

type ReportOverrides = Partial<{
  authentication: unknown;
  outcome: unknown;
  activity: unknown;
}>;

const createReport = (overrides: ReportOverrides = {}) =>
  ({
    inbox: { kind: 'shared', recipient: null },
    payload: { status: 'unavailable' },
    activity: createActivity(),
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
        actorIds: [new URL('https://remote.example/users/alice')],
      },
    },
    outcome: { type: 'response', status: 401, disposition: 'rejected', reason: 'authentication' },
    ...overrides,
  }) as unknown as InboxRequestReport;

describe('extractRelayForwardedCreate', () => {
  it('returns the object, the actor, and the key owner of a Create rejected by an actor key mismatch', () => {
    expect(extractRelayForwardedCreate(createReport())).toEqual({
      objectId: new URL('https://remote.example/notes/1'),
      actorId: new URL('https://remote.example/users/alice'),
      keyOwnerId: new URL('https://relay.example/actor'),
    });
  });

  it('returns undefined when the rejection reason is verificationFailed', () => {
    const report = createReport({
      authentication: { status: 'rejected', reason: { type: 'verificationFailed' } },
    });

    expect(extractRelayForwardedCreate(report)).toBeUndefined();
  });

  it('returns undefined when the response status is 202', () => {
    const report = createReport({
      outcome: { type: 'response', status: 202, disposition: 'enqueued' },
    });

    expect(extractRelayForwardedCreate(report)).toBeUndefined();
  });

  it('returns undefined when the activity is an Announce', () => {
    const report = createReport({
      activity: new Announce({
        id: new URL('https://remote.example/activities/2'),
        actor: new URL('https://remote.example/users/alice'),
        object: new URL('https://remote.example/notes/1'),
      }),
    });

    expect(extractRelayForwardedCreate(report)).toBeUndefined();
  });

  it('returns undefined when the object and the actor are on different origins', () => {
    const report = createReport({ activity: createActivity('https://other.example/notes/1') });

    expect(extractRelayForwardedCreate(report)).toBeUndefined();
  });

  it('returns undefined when the key has no owner', () => {
    const report = createReport({
      authentication: {
        status: 'rejected',
        reason: {
          type: 'actorKeyMismatch',
          key: { type: 'cryptographicKey', id: null, ownerId: null, publicKey: {} },
          actorIds: [],
        },
      },
    });

    expect(extractRelayForwardedCreate(report)).toBeUndefined();
  });
});
