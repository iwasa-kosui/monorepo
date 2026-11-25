import type { AgentEnv } from './agent/env';
import { handleAgent } from './agent/handler';

type Env =
  & AgentEnv
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
  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'not_found' }, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  return env.ASSETS.fetch(request);
};

export default { fetch: handleRequest };
