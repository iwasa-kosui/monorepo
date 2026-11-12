import { RA, Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type {
  BlueskyLoginFailureDeletedStore,
  BlueskyLoginFailureResolver,
  BlueskyLoginFailureSavedStore,
  BlueskySession,
  BlueskySessionResolver,
  BlueskySessionSavedStore,
} from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { BlueskyBlob } from '../../domain/blueskyCrosspost/blueskyPostRecord.ts';
import { blueskyLikeRkey } from '../../domain/blueskyTimeline/blueskyLike.ts';
import { blueskyRepostRkey } from '../../domain/blueskyTimeline/blueskyRepost.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type {
  BlueskyClient,
  BlueskyClientError,
  BlueskyClientErrorKind,
  BlueskyQueryClient,
} from '../../ports/blueskyClient.ts';

export const BLUESKY_DEFAULT_PDS_URL = 'https://bsky.social';
const POST_COLLECTION = 'app.bsky.feed.post';
const LIKE_COLLECTION = 'app.bsky.feed.like';
const REPOST_COLLECTION = 'app.bsky.feed.repost';
const FOLLOW_COLLECTION = 'app.bsky.graph.follow';
const REQUEST_TIMEOUT_MS = 10_000;
const UPLOAD_TIMEOUT_MS = 30_000;
export const BLUESKY_LOGIN_RETRY_COOLDOWN_MS = 30 * 60 * 1000;

type BlueskyClientDeps = Readonly<{
  identifier: string;
  appPassword: string;
  sessionResolver: BlueskySessionResolver;
  sessionStore: BlueskySessionSavedStore;
  loginFailure?: Readonly<{
    resolver: BlueskyLoginFailureResolver;
    savedStore: BlueskyLoginFailureSavedStore;
    deletedStore: BlueskyLoginFailureDeletedStore;
  }>;
  fetch?: typeof fetch;
  now?: () => Instant;
}>;

const sessionResponseSchema = z.object({
  did: z.string().min(1),
  handle: z.string().min(1),
  accessJwt: z.string().min(1),
  refreshJwt: z.string().min(1),
  didDoc: z.unknown().optional(),
});
const didDocSchema = z.object({
  service: z.array(z.object({ id: z.string(), serviceEndpoint: z.unknown() })),
});
const blobSchema = z.object({
  $type: z.literal('blob'),
  ref: z.object({ $link: z.string().min(1) }),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
});
const uploadBlobResponseSchema = z.object({ blob: blobSchema });
const createRecordResponseSchema = z.object({ uri: z.string().min(1), cid: z.string().min(1) });
const emptyResponseSchema = z.looseObject({});
const queryResponseSchema = z.record(z.string(), z.unknown());
const errorBodySchema = z.object({ error: z.string().optional() });
const recordUriPattern = /^at:\/\/[^/]+\/app\.bsky\.feed\.post\/([^/]+)$/;
const followUriPattern = /^at:\/\/[^/]+\/app\.bsky\.graph\.follow\/([^/]+)$/;

const clientError = (
  kind: BlueskyClientErrorKind,
  message: string,
  status?: number,
  code?: string,
): BlueskyClientError => ({
  type: 'BlueskyClientError',
  kind,
  message,
  ...(status === undefined ? {} : { status }),
  ...(code === undefined ? {} : { code }),
});

export const resolveBlueskyPdsUrl = (didDoc: unknown): string | undefined => {
  const parsed = didDocSchema.safeParse(didDoc);
  if (!parsed.success) return undefined;
  const endpoint = parsed.data.service.find((service) => service.id.endsWith('#atproto_pds'))?.serviceEndpoint;
  if (typeof endpoint !== 'string') return undefined;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
};

export const createBlueskyClient = (deps: BlueskyClientDeps): BlueskyClient & BlueskyQueryClient => {
  const fetchRequest = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Instant.now;

  const call = async <S extends z.ZodType>(
    operation: string,
    url: string,
    init: RequestInit,
    schema: S,
    timeoutMs: number = REQUEST_TIMEOUT_MS,
  ): RA<z.output<S>, BlueskyClientError> => {
    let response: Response;
    try {
      response = await fetchRequest(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      return RA.err(clientError('network', `${operation} request failed`));
    }
    if (!response.ok) {
      const body = errorBodySchema.safeParse(await response.json().catch(() => undefined));
      const name = body.success ? body.data.error : undefined;
      const expired = name === 'ExpiredToken' || name === 'InvalidToken';
      return RA.err(
        clientError(
          response.status === 401 || expired ? 'auth' : 'http',
          `${operation} failed: status ${response.status}${name === undefined ? '' : ` ${name}`}`,
          response.status,
          name,
        ),
      );
    }
    const text = await response.text().catch(() => undefined);
    let payload: unknown;
    try {
      payload = text === undefined ? undefined : text === '' ? {} : JSON.parse(text);
    } catch {
      payload = undefined;
    }
    const parsed = schema.safeParse(payload);
    return parsed.success
      ? RA.ok(parsed.data)
      : RA.err(clientError('invalid_response', `${operation} returned an unexpected response`));
  };

  const saveSession = async (
    data: z.output<typeof sessionResponseSchema>,
    previous: BlueskySession | undefined,
  ): Promise<BlueskySession> => {
    const session: BlueskySession = {
      did: data.did,
      handle: data.handle,
      pdsUrl: resolveBlueskyPdsUrl(data.didDoc) ?? previous?.pdsUrl ?? BLUESKY_DEFAULT_PDS_URL,
      accessJwt: data.accessJwt,
      refreshJwt: data.refreshJwt,
      updatedAt: now(),
    };
    await deps.sessionStore.save(session);
    return session;
  };

  const createSession = async (): RA<BlueskySession, BlueskyClientError> => {
    const loginFailure = deps.loginFailure;
    const failedAt = loginFailure === undefined
      ? undefined
      : Result.unsafeUnwrap(await loginFailure.resolver.resolve());
    if (failedAt !== undefined && now() - failedAt < BLUESKY_LOGIN_RETRY_COOLDOWN_MS) {
      return RA.err(clientError('auth', 'createSession skipped: waiting after a recent login failure'));
    }
    const created = await call(
      'createSession',
      `${BLUESKY_DEFAULT_PDS_URL}/xrpc/com.atproto.server.createSession`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: deps.identifier, password: deps.appPassword }),
      },
      sessionResponseSchema,
    );
    if (!created.ok) {
      if (loginFailure !== undefined) Result.unsafeUnwrap(await loginFailure.savedStore.save(now()));
      return created;
    }
    const session = await saveSession(created.val, undefined);
    if (loginFailure !== undefined && failedAt !== undefined) {
      Result.unsafeUnwrap(await loginFailure.deletedStore.delete());
    }
    return RA.ok(session);
  };

  const refreshSession = async (session: BlueskySession): RA<BlueskySession, BlueskyClientError> => {
    const refreshed = await call(
      'refreshSession',
      `${session.pdsUrl}/xrpc/com.atproto.server.refreshSession`,
      { method: 'POST', headers: { Authorization: `Bearer ${session.refreshJwt}` } },
      sessionResponseSchema,
    );
    return refreshed.ok ? RA.ok(await saveSession(refreshed.val, session)) : refreshed;
  };

  const withSession = async <T>(
    operation: (session: BlueskySession) => RA<T, BlueskyClientError>,
  ): RA<T, BlueskyClientError> => {
    const stored = Result.unsafeUnwrap(await deps.sessionResolver.resolve());
    const current = stored === undefined ? await createSession() : Result.ok(stored);
    if (!current.ok) return current;
    const first = await operation(current.val);
    if (first.ok || first.err.kind !== 'auth' || stored === undefined) return first;
    const refreshed = await refreshSession(stored);
    const next = refreshed.ok ? refreshed : await createSession();
    return next.ok ? operation(next.val) : next;
  };

  const authorized = (session: BlueskySession, headers: Record<string, string> = {}): Record<string, string> => ({
    ...headers,
    Authorization: `Bearer ${session.accessJwt}`,
  });

  const removeRecord = (collection: string, rkey: string): RA<void, BlueskyClientError> =>
    withSession(async (session) => {
      const deleted = await call(
        'deleteRecord',
        `${session.pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
        {
          method: 'POST',
          headers: authorized(session, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ repo: session.did, collection, rkey }),
        },
        emptyResponseSchema,
      );
      if (deleted.ok || deleted.err.status === 404 || deleted.err.code === 'RecordNotFound') {
        return RA.ok(undefined);
      }
      return deleted;
    });

  return {
    uploadBlob: ({ bytes, mimeType }) =>
      withSession(async (session) => {
        const uploaded = await call(
          'uploadBlob',
          `${session.pdsUrl}/xrpc/com.atproto.repo.uploadBlob`,
          { method: 'POST', headers: authorized(session, { 'Content-Type': mimeType }), body: bytes.slice().buffer },
          uploadBlobResponseSchema,
          UPLOAD_TIMEOUT_MS,
        );
        return uploaded.ok ? RA.ok<BlueskyBlob>(uploaded.val.blob) : uploaded;
      }),
    createRecord: (record, rkey) =>
      withSession(async (session) => {
        const created = await call(
          'createRecord',
          `${session.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
          {
            method: 'POST',
            headers: authorized(session, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ repo: session.did, collection: POST_COLLECTION, rkey, record }),
          },
          createRecordResponseSchema,
        );
        if (!created.ok) return created;
        const createdRkey = recordUriPattern.exec(created.val.uri)?.[1];
        return createdRkey === undefined
          ? RA.err(clientError('invalid_response', 'createRecord returned an unexpected uri'))
          : RA.ok({ uri: created.val.uri, cid: created.val.cid, rkey: createdRkey });
      }),
    getRecord: (rkey, collection = POST_COLLECTION) =>
      withSession(async (session) => {
        const query = new URLSearchParams({ repo: session.did, collection, rkey });
        const found = await call(
          'getRecord',
          `${session.pdsUrl}/xrpc/com.atproto.repo.getRecord?${query.toString()}`,
          { method: 'GET', headers: authorized(session) },
          createRecordResponseSchema,
        );
        if (!found.ok) return found;
        const foundRkey = (collection === FOLLOW_COLLECTION ? followUriPattern : recordUriPattern).exec(found.val.uri)
          ?.[1];
        return foundRkey === undefined
          ? RA.err(clientError('invalid_response', 'getRecord returned an unexpected uri'))
          : RA.ok({ uri: found.val.uri, cid: found.val.cid, rkey: foundRkey });
      }),
    deleteRecord: (rkey) => removeRecord(POST_COLLECTION, rkey),
    createLike: (subject, rkey) =>
      withSession(async (session) => {
        const created = await call(
          'createLike',
          `${session.pdsUrl}/xrpc/com.atproto.repo.putRecord`,
          {
            method: 'POST',
            headers: authorized(session, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              repo: session.did,
              collection: LIKE_COLLECTION,
              rkey,
              record: {
                $type: LIKE_COLLECTION,
                subject: { uri: subject.uri, cid: subject.cid },
                createdAt: new Date(now()).toISOString(),
              },
            }),
          },
          createRecordResponseSchema,
        );
        if (!created.ok) return created;
        return blueskyLikeRkey(created.val.uri) !== undefined
          ? RA.ok({ uri: created.val.uri })
          : RA.err(clientError('invalid_response', 'createLike returned an unexpected uri'));
      }),
    deleteLike: (rkey) => removeRecord(LIKE_COLLECTION, rkey),
    createRepost: (subject, rkey) =>
      withSession(async (session) => {
        const created = await call(
          'createRepost',
          `${session.pdsUrl}/xrpc/com.atproto.repo.putRecord`,
          {
            method: 'POST',
            headers: authorized(session, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              repo: session.did,
              collection: REPOST_COLLECTION,
              rkey,
              record: {
                $type: REPOST_COLLECTION,
                subject: { uri: subject.uri, cid: subject.cid },
                createdAt: new Date(now()).toISOString(),
              },
            }),
          },
          createRecordResponseSchema,
        );
        if (!created.ok) return created;
        return blueskyRepostRkey(created.val.uri) !== undefined
          ? RA.ok({ uri: created.val.uri })
          : RA.err(clientError('invalid_response', 'createRepost returned an unexpected uri'));
      }),
    deleteRepost: (rkey) => removeRecord(REPOST_COLLECTION, rkey),
    createFollow: (subjectDid) =>
      withSession(async (session) => {
        const created = await call(
          'createFollow',
          `${session.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
          {
            method: 'POST',
            headers: authorized(session, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              repo: session.did,
              collection: FOLLOW_COLLECTION,
              record: {
                $type: FOLLOW_COLLECTION,
                subject: subjectDid,
                createdAt: new Date(now()).toISOString(),
              },
            }),
          },
          createRecordResponseSchema,
        );
        if (!created.ok) return created;
        return followUriPattern.test(created.val.uri)
          ? RA.ok({ uri: created.val.uri })
          : RA.err(clientError('invalid_response', 'createFollow returned an unexpected uri'));
      }),
    deleteFollow: async (followUri) => {
      const rkey = followUriPattern.exec(followUri)?.[1];
      return rkey === undefined
        ? RA.err(clientError('invalid_response', 'deleteFollow received an unexpected uri'))
        : removeRecord(FOLLOW_COLLECTION, rkey);
    },
    query: (nsid, params) =>
      withSession((session) => {
        const search = new URLSearchParams(params).toString();
        return call(
          nsid,
          `${session.pdsUrl}/xrpc/${nsid}${search === '' ? '' : `?${search}`}`,
          { method: 'GET', headers: authorized(session) },
          queryResponseSchema,
        );
      }),
  };
};
