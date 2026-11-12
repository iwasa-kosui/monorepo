import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

export type PasskeyCredential = Readonly<{
  credentialId: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceType: string;
  backedUp: boolean;
}>;

export class PasskeyApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code: string | undefined) {
    super(code ?? `HTTP ${status}`);
    this.name = 'PasskeyApiError';
    this.status = status;
    this.code = code;
  }
}

export const isPasskeyApiError = (error: unknown): error is PasskeyApiError => error instanceof PasskeyApiError;

const PASSKEY_PATH = '/auth/passkey';

const toPasskeyApiError = async (res: Response): Promise<PasskeyApiError> => {
  const body: unknown = await res.json().catch(() => undefined);
  const code = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
    ? body.error
    : undefined;
  return new PasskeyApiError(res.status, code);
};

const request = async (method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<Response> => {
  const res = await fetch(`${PASSKEY_PATH}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    credentials: 'same-origin',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw await toPasskeyApiError(res);
  return res;
};

export const fetchRegistrationOptions = async (password: string): Promise<PublicKeyCredentialCreationOptionsJSON> => {
  const res = await request('POST', '/registration-options', { password });
  return await res.json() as PublicKeyCredentialCreationOptionsJSON;
};

export const registerPasskey = async (
  response: RegistrationResponseJSON,
  name?: string,
): Promise<PasskeyCredential> => {
  const res = await request('POST', '/registrations', name === undefined ? { response } : { response, name });
  const body = await res.json() as { credential: PasskeyCredential };
  return body.credential;
};

export const fetchAuthenticationOptions = async (): Promise<PublicKeyCredentialRequestOptionsJSON> => {
  const res = await request('POST', '/authentication-options');
  return await res.json() as PublicKeyCredentialRequestOptionsJSON;
};

export const signInWithPasskey = async (
  response: AuthenticationResponseJSON,
  next?: string,
): Promise<string> => {
  const res = await request('POST', '/sign-in', next === undefined ? { response } : { response, next });
  const body = await res.json() as { redirectTo: string };
  return body.redirectTo;
};

export const fetchPasskeyCredentials = async (): Promise<readonly PasskeyCredential[]> => {
  const res = await request('GET', '/credentials');
  const body = await res.json() as { credentials: readonly PasskeyCredential[] };
  return body.credentials;
};

export const deletePasskeyCredential = async (credentialId: string): Promise<void> => {
  await request('DELETE', `/credentials/${encodeURIComponent(credentialId)}`);
};
