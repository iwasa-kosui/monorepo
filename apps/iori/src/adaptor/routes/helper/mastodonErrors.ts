import type { ErrorHandler } from 'hono';

export const internalServerError = { error: 'Internal server error' } as const;

export const actorNotFound = { error: 'Actor not found' } as const;

export const handleInternalError: ErrorHandler = (_error, c) => c.json(internalServerError, 500);
