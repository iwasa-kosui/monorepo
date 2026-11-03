import type { Result } from '@iwasa-kosui/result';

import type { Schema } from '../../helper/schema.ts';

export type ParseError = Extract<ReturnType<Schema<unknown, unknown>['parse']>, Readonly<{ ok: false }>>['err'];
export type ParseResult<T> = Result<T, ParseError>;

export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'unsupported_response_type'
  | 'invalid_scope'
  | 'access_denied';

export type OAuthError = Readonly<{
  type: 'OAuthError';
  error: OAuthErrorCode;
  message: string;
}>;

export const OAuthError = {
  create: (error: OAuthErrorCode, message: string): OAuthError => ({
    type: 'OAuthError',
    error,
    message,
  }),
} as const;

export type UnredirectableAuthorizationError = Readonly<{
  type: 'UnredirectableAuthorizationError';
  message: string;
}>;

export const UnredirectableAuthorizationError = {
  create: (message: string): UnredirectableAuthorizationError => ({
    type: 'UnredirectableAuthorizationError',
    message,
  }),
} as const;
