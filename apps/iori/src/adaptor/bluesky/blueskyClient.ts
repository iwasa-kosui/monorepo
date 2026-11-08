import { RA, Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type {
  BlueskySession,
  BlueskySessionResolver,
  BlueskySessionSavedStore,
} from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { BlueskyBlob } from '../../domain/blueskyCrosspost/blueskyPostRecord.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type {
  BlueskyClient,
  BlueskyClientError,
  BlueskyClientErrorKind,
  BlueskyQueryClient,
} from '../../ports/blueskyClient.ts';

export const BLUESKY_DEFAULT_PDS_URL = 'https://bsky.social';
const POST_COLLECTION = 'app.bsky.feed.post';

type BlueskyClientDeps = Readonly<{
  identifier: string;
  appPassword: string;
  sessionResolver: BlueskySessionResolver;
  sessionStore: BlueskySessionSavedStore;
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

const clientError = (kind: BlueskyClientErrorKind, message: string, status?: number): BlueskyClientError => ({
  type: 'BlueskyClientError',
  kind,
  message,
  ...(status === undefined ? {} : { status }),
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
  ): RA<z.output<S>, BlueskyClientError> => {
    let response: Response;
    try {
      response = await fetchRequest(url, init);
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
    return created.ok ? RA.ok(await saveSession(created.val, undefined)) : created;
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

  return {
    uploadBlob: ({ bytes, mimeType }) =>
      withSession(async (session) => {
        const uploaded = await call(
          'uploadBlob',
          `${session.pdsUrl}/xrpc/com.atproto.repo.uploadBlob`,
          { method: 'POST', headers: authorized(session, { 'Content-Type': mimeType }), body: bytes.slice().buffer },
          uploadBlobResponseSchema,
        );
        return uploaded.ok ? RA.ok<BlueskyBlob>(uploaded.val.blob) : uploaded;
      }),
    createRecord: (record) =>
      withSession(async (session) => {
        const created = await call(
          'createRecord',
          `${session.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
          {
            method: 'POST',
            headers: authorized(session, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ repo: session.did, collection: POST_COLLECTION, record }),
          },
          createRecordResponseSchema,
        );
        if (!created.ok) return created;
        const rkey = recordUriPattern.exec(created.val.uri)?.[1];
        return rkey === undefined
          ? RA.err(clientError('invalid_response', 'createRecord returned an unexpected uri'))
          : RA.ok({ uri: created.val.uri, cid: created.val.cid, rkey });
      }),
    deleteRecord: (rkey) =>
      withSession(async (session) => {
        const deleted = await call(
          'deleteRecord',
          `${session.pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
          {
            method: 'POST',
            headers: authorized(session, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ repo: session.did, collection: POST_COLLECTION, rkey }),
          },
          emptyResponseSchema,
        );
        return deleted.ok ? RA.ok(undefined) : deleted;
      }),
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
