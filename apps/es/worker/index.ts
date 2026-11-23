type Env = Readonly<{
  ASSETS: Readonly<{ fetch: (request: Request) => Promise<Response> }>;
}>;

export const handleRequest = async (request: Request, env: Env): Promise<Response> => {
  if (new URL(request.url).pathname === '/healthz') {
    return new Response('ok', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return env.ASSETS.fetch(request);
};

export default { fetch: handleRequest };
