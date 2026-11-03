import { Secret } from '../../../domain/oauth/secret.ts';

export type AuthorizeFields = Readonly<{
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}>;

const importKey = (sessionId: string) =>
  crypto.subtle.importKey('raw', new TextEncoder().encode(sessionId), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);

const payload = (fields: AuthorizeFields) =>
  new TextEncoder().encode(
    JSON.stringify([
      fields.clientId,
      fields.redirectUri,
      fields.scope,
      fields.state,
      fields.codeChallenge,
      fields.codeChallengeMethod,
    ]),
  );

export const createAuthorizeCsrfToken = async (sessionId: string, fields: AuthorizeFields): Promise<string> =>
  Secret.toBase64Url(
    new Uint8Array(await crypto.subtle.sign('HMAC', await importKey(sessionId), payload(fields))),
  );

export const verifyAuthorizeCsrfToken = async (
  sessionId: string,
  fields: AuthorizeFields,
  token: string | undefined,
): Promise<boolean> => {
  if (token === undefined || !/^[A-Za-z0-9_-]+$/.test(token)) return false;
  try {
    const signature = Uint8Array.from(
      atob(token.replaceAll('-', '+').replaceAll('_', '/')),
      (char) => char.charCodeAt(0),
    );
    return await crypto.subtle.verify('HMAC', await importKey(sessionId), signature, payload(fields));
  } catch {
    return false;
  }
};
