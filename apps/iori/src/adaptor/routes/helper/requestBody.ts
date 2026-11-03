import type { Context } from 'hono';

export type RequestBody = Readonly<Record<string, unknown>>;

export const readRequestBody = async (c: Context): Promise<RequestBody> => {
  const contentType = c.req.header('Content-Type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const json: unknown = await c.req.json();
      return typeof json === 'object' && json !== null && !Array.isArray(json) ? json as RequestBody : {};
    }
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      return await c.req.parseBody({ all: true });
    }
  } catch {
    return {};
  }
  return {};
};

export const bodyString = (body: RequestBody, key: string): string | undefined => {
  const value = body[key];
  return typeof value === 'string' ? value : undefined;
};
