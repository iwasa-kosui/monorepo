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

export const bodyTrimmedStringArray = (body: RequestBody, key: string): string[] | undefined => {
  const value = body[key];
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string')
    ? value.map((item) => item.trim())
    : undefined;
};

export const bodyStringList = (body: RequestBody, ...keys: ReadonlyArray<string>): string[] =>
  keys.flatMap((key) => {
    const value = body[key];
    if (typeof value === 'string') return [value];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  });

export const bodyBoolean = (body: RequestBody, key: string): boolean => {
  const value = body[key];
  return value === true || (typeof value === 'string' && ['true', '1', 'on', 't', 'yes'].includes(value.toLowerCase()));
};
