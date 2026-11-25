import { agentLimits } from '../../src/playground/agent-protocol.ts';
import { bearerTokenOf, matchesPassword } from './auth.ts';
import type { AgentEnv } from './env.ts';
import { askModel } from './model.ts';
import { parseAgentRequest, readLimitedText } from './request.ts';

const respond = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): Response =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });

const clientKey = (request: Request): string => request.headers.get('cf-connecting-ip') ?? 'unknown';

export const handleAgent = async (request: Request, env: AgentEnv): Promise<Response> => {
  const password = env.AGENT_PASSWORD ?? '';
  if (password === '') {
    return respond(503, { error: 'disabled' });
  }
  if (request.method !== 'POST') {
    return respond(405, { error: 'method_not_allowed' }, { allow: 'POST' });
  }
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return respond(403, { error: 'forbidden_origin' });
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return respond(415, { error: 'unsupported_media_type' });
  }
  const given = bearerTokenOf(request.headers.get('authorization'));
  if (!(await matchesPassword(given, password))) {
    const failures = await env.AGENT_AUTH_FAILURE_LIMIT?.limit({ key: clientKey(request) });
    return failures?.success === false
      ? respond(429, { error: 'too_many_requests' }, { 'retry-after': '60' })
      : respond(401, { error: 'unauthorized' });
  }
  const allowed = await env.AGENT_RATE_LIMIT?.limit({ key: clientKey(request) });
  if (allowed?.success === false) {
    return respond(429, { error: 'too_many_requests' }, { 'retry-after': '60' });
  }
  const text = await readLimitedText(request, agentLimits.bodyBytes);
  if (text === null) {
    return respond(413, { error: 'payload_too_large' });
  }
  const parsed = parseAgentRequest(text);
  if (!parsed.ok) {
    return respond(400, { error: 'invalid_request', reason: parsed.reason });
  }
  if (env.AI === undefined) {
    return respond(503, { error: 'disabled' });
  }
  try {
    const move = await askModel(env.AI, parsed.value);
    return move === null ? respond(502, { error: 'bad_model_reply' }) : respond(200, { move });
  } catch {
    return respond(502, { error: 'model_failed' });
  }
};
