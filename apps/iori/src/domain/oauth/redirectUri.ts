import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

const OOB = 'urn:ietf:wg:oauth:2.0:oob';
const MAX_LENGTH = 2000;
const blockedProtocols: ReadonlyArray<string> = ['javascript:', 'data:', 'vbscript:', 'file:'];

const isAcceptable = (value: string): boolean => {
  if (value.length === 0 || value.length > MAX_LENGTH || /\s/.test(value)) return false;
  if (value === OOB) return true;
  if (value.includes('#')) return false;
  try {
    return !blockedProtocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export const RedirectUriSym = Symbol('RedirectUri');
const zodType = z.string().refine(isAcceptable, 'Invalid redirect URI').brand(RedirectUriSym).describe('RedirectUri');
export type RedirectUri = z.output<typeof zodType>;
const schema = Schema.create<RedirectUri, string>(zodType);

export type InvalidRedirectUriError = Readonly<{
  type: 'InvalidRedirectUriError';
  message: string;
}>;

export const InvalidRedirectUriError = {
  create: (message: string): InvalidRedirectUriError => ({
    type: 'InvalidRedirectUriError',
    message,
  }),
} as const;

const parseList = (input: unknown): Result<ReadonlyArray<RedirectUri>, InvalidRedirectUriError> => {
  const rawValues = typeof input === 'string' ? [input] : Array.isArray(input) ? input : [];
  const candidates: string[] = [];
  for (const raw of rawValues) {
    if (typeof raw !== 'string') {
      return Result.err(InvalidRedirectUriError.create('redirect_uris must be strings'));
    }
    for (const line of raw.split(/[\r\n]+/)) {
      const trimmed = line.trim();
      if (trimmed.length > 0) candidates.push(trimmed);
    }
  }
  if (candidates.length === 0) {
    return Result.err(InvalidRedirectUriError.create('redirect_uris is required'));
  }
  const uris: RedirectUri[] = [];
  for (const candidate of candidates) {
    const parsed = schema.parse(candidate);
    if (!parsed.ok) {
      return Result.err(InvalidRedirectUriError.create(`redirect_uris contains an invalid URI: ${candidate}`));
    }
    if (!uris.includes(parsed.val)) uris.push(parsed.val);
  }
  return Result.ok(uris);
};

export const RedirectUri = {
  ...schema,
  oob: OOB as RedirectUri,
  isOob: (uri: string): boolean => uri === OOB,
  parseList,
} as const;
