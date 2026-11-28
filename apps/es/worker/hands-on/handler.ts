import { isLiveId } from '../../src/workspace/live-protocol.ts';
import { bearerTokenOf, matchesPassword } from '../agent/auth.ts';
import type { RateLimitBinding } from '../agent/env.ts';
import { authorParam } from './room.ts';

export type RoomNamespace = Readonly<{
  idFromName: (name: string) => unknown;
  get: (id: unknown) => Readonly<{ fetch: (request: Request) => Promise<Response> }>;
}>;

export type HandsOnEnv = Readonly<{
  HANDS_ON_ROOM?: RoomNamespace;
  HANDS_ON_ADMIN_PASSWORD?: string;
  AGENT_AUTH_FAILURE_LIMIT?: RateLimitBinding;
}>;

export const roomName = 'hands-on';

const respond = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): Response =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });

const clientKey = (request: Request): string => request.headers.get('cf-connecting-ip') ?? 'unknown';

export const authorOf = async (sender: string): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sender)));
  return [...digest.slice(0, 6)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const handleHandsOn = async (request: Request, env: HandsOnEnv): Promise<Response> => {
  const namespace = env.HANDS_ON_ROOM;
  if (namespace === undefined) {
    return respond(503, { error: 'disabled' });
  }
  const url = new URL(request.url);
  const room = namespace.get(namespace.idFromName(roomName));
  if (request.method === 'DELETE') {
    const password = env.HANDS_ON_ADMIN_PASSWORD ?? '';
    if (password === '') {
      return respond(503, { error: 'disabled' });
    }
    if (!(await matchesPassword(bearerTokenOf(request.headers.get('authorization')), password))) {
      const failures = await env.AGENT_AUTH_FAILURE_LIMIT?.limit({ key: clientKey(request) });
      return failures?.success === false
        ? respond(429, { error: 'too_many_requests' }, { 'retry-after': '60' })
        : respond(401, { error: 'unauthorized' });
    }
    return room.fetch(new Request(`https://${roomName}/`, { method: 'DELETE' }));
  }
  if (request.method !== 'GET') {
    return respond(405, { error: 'method_not_allowed' }, { allow: 'GET, DELETE' });
  }
  if ((request.headers.get('upgrade') ?? '').toLowerCase() !== 'websocket') {
    return respond(426, { error: 'upgrade_required' }, { upgrade: 'websocket' });
  }
  if (request.headers.get('origin') !== url.origin) {
    return respond(403, { error: 'forbidden_origin' });
  }
  const sender = url.searchParams.get('sender');
  if (!isLiveId(sender)) {
    return respond(400, { error: 'invalid_request' });
  }
  const target = new URL(`https://${roomName}/`);
  target.searchParams.set(authorParam, await authorOf(sender));
  return room.fetch(new Request(target, request));
};
