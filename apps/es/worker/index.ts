import { liveEndpoint } from '../src/workspace/live-protocol';
import type { AgentEnv } from './agent/env';
import { handleAgent } from './agent/handler';
import { handleHandsOn, type HandsOnEnv } from './hands-on/handler';

type Env =
  & AgentEnv
  & HandsOnEnv
  & Readonly<{
    ASSETS: Readonly<{ fetch: (request: Request) => Promise<Response> }>;
  }>;

export const handleRequest = async (request: Request, env: Env): Promise<Response> => {
  const { pathname } = new URL(request.url);
  if (pathname === '/healthz') {
    return new Response('ok', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  if (pathname === '/api/agent') {
    return handleAgent(request, env);
  }
  if (pathname === liveEndpoint) {
    return handleHandsOn(request, env);
  }
  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'not_found' }, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  return env.ASSETS.fetch(request);
};

export { HandsOnRoom } from './hands-on/room';

export default { fetch: handleRequest };
