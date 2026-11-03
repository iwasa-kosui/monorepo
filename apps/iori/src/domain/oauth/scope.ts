import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

const readScopes = [
  'read:accounts',
  'read:blocks',
  'read:bookmarks',
  'read:favourites',
  'read:filters',
  'read:follows',
  'read:lists',
  'read:mutes',
  'read:notifications',
  'read:search',
  'read:statuses',
] as const;

const writeScopes = [
  'write:accounts',
  'write:blocks',
  'write:bookmarks',
  'write:conversations',
  'write:favourites',
  'write:filters',
  'write:follows',
  'write:lists',
  'write:media',
  'write:mutes',
  'write:notifications',
  'write:reports',
  'write:statuses',
] as const;

const MAX_LIST_LENGTH = 1000;
const listInputSchema = z.string().max(MAX_LIST_LENGTH);

const baseScopes = ['read', 'write', 'follow', 'push', 'profile'] as const;
const allScopes = [...baseScopes, ...readScopes, ...writeScopes] as const;
const followImplied: ReadonlyArray<string> = ['read:follows', 'write:follows', 'write:blocks', 'write:mutes'];

export const ScopeSym = Symbol('Scope');
const zodType = z.enum(allScopes).brand(ScopeSym).describe('Scope');
export type Scope = z.output<typeof zodType>;
const schema = Schema.create<Scope, string>(zodType);

export type InvalidScopeError = Readonly<{
  type: 'InvalidScopeError';
  message: string;
  detail: { scope: string };
}>;

export const InvalidScopeError = {
  create: (scope: string): InvalidScopeError => ({
    type: 'InvalidScopeError',
    message: `The scope "${scope}" is not supported.`,
    detail: { scope },
  }),
  tooLong: (): InvalidScopeError => ({
    type: 'InvalidScopeError',
    message: `The scope must be at most ${MAX_LIST_LENGTH} characters.`,
    detail: { scope: '' },
  }),
} as const;

const read = schema.orThrow('read');
const defaultScopes: ReadonlyArray<Scope> = [read];
const fullAccess: ReadonlyArray<Scope> = baseScopes.map((scope) => schema.orThrow(scope));

const parseList = (input: string | null | undefined): Result<ReadonlyArray<Scope>, InvalidScopeError> => {
  if (!listInputSchema.safeParse(input ?? '').success) {
    return Result.err(InvalidScopeError.tooLong());
  }
  const tokens = (input ?? '').split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return Result.ok(defaultScopes);
  }
  const scopes: Scope[] = [];
  for (const token of tokens) {
    const parsed = schema.parse(token);
    if (!parsed.ok) {
      return Result.err(InvalidScopeError.create(token));
    }
    if (!scopes.includes(parsed.val)) {
      scopes.push(parsed.val);
    }
  }
  return Result.ok(scopes);
};

const isCoveredBy = (required: Scope, granted: Scope): boolean => {
  if (required === granted) return true;
  if (granted === 'read') return required.startsWith('read:');
  if (granted === 'write') return required.startsWith('write:');
  if (granted === 'follow') return followImplied.includes(required);
  return false;
};

const includes = (granted: ReadonlyArray<Scope>, required: Scope): boolean =>
  granted.some((scope) => isCoveredBy(required, scope));

const includesAny = (granted: ReadonlyArray<Scope>, required: ReadonlyArray<Scope>): boolean =>
  required.some((scope) => includes(granted, scope));

const isSubset = (requested: ReadonlyArray<Scope>, registered: ReadonlyArray<Scope>): boolean =>
  requested.every((scope) => includes(registered, scope));

const serialize = (scopes: ReadonlyArray<Scope>): string => scopes.join(' ');

export const Scope = {
  ...schema,
  all: allScopes.map((scope) => schema.orThrow(scope)) as ReadonlyArray<Scope>,
  default: defaultScopes,
  fullAccess,
  parseList,
  includes,
  includesAny,
  isSubset,
  serialize,
} as const;
