import { DrizzleQueryError } from 'drizzle-orm';
import type { ErrorHandler } from 'hono';

export const internalServerError = { error: 'Internal server error' } as const;

export const actorNotFound = { error: 'Actor not found' } as const;

const summarize = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : 'non-Error value';

export const describeErrorForLog = (error: unknown): { query: string; cause: string } | string =>
  error instanceof DrizzleQueryError
    ? { query: error.query, cause: summarize(error.cause) }
    : summarize(error);

export const handleInternalError: ErrorHandler = (error, c) => {
  console.error('Mastodon API request failed.', describeErrorForLog(error));
  return c.json(internalServerError, 500);
};
