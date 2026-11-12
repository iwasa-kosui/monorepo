import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

export const LOCAL_ACTOR_DISPLAY_NAME_MAX_LENGTH = 30;
export const LOCAL_ACTOR_BIO_MAX_LENGTH = 500;

const lengthOf = (value: string): number => [...value].length;

const displayNameSchema = z.string().refine((value) => lengthOf(value) <= LOCAL_ACTOR_DISPLAY_NAME_MAX_LENGTH);
const bioSchema = z.string().refine((value) => lengthOf(value) <= LOCAL_ACTOR_BIO_MAX_LENGTH);

export type InvalidLocalActorProfileError = Readonly<{
  type: 'InvalidLocalActorProfileError';
  message: string;
  detail: { field: 'displayName' | 'bio'; reason: 'tooLong' };
}>;

export const InvalidLocalActorProfileError = {
  create: (field: InvalidLocalActorProfileError['detail']['field']): InvalidLocalActorProfileError => ({
    type: 'InvalidLocalActorProfileError',
    message: field === 'displayName'
      ? `Display name is too long (maximum is ${LOCAL_ACTOR_DISPLAY_NAME_MAX_LENGTH} characters)`
      : `Note is too long (maximum is ${LOCAL_ACTOR_BIO_MAX_LENGTH} characters)`,
    detail: { field, reason: 'tooLong' },
  }),
} as const;

export type LocalActorProfileInput = Readonly<{ displayName?: string; bio?: string }>;

export type LocalActorProfilePatch = Readonly<{ displayName?: string | null; bio?: string | null }>;

const normalizeNewlines = (value: string): string => value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

const replaceControlCharacters = (value: string): string => value.replace(/\p{Cc}/gu, ' ');

const validate = (input: LocalActorProfileInput): Result<LocalActorProfilePatch, InvalidLocalActorProfileError> => {
  const displayName = input.displayName === undefined ? undefined : replaceControlCharacters(input.displayName);
  const bio = input.bio === undefined ? undefined : normalizeNewlines(input.bio);
  if (displayName !== undefined && !displayNameSchema.safeParse(displayName).success) {
    return Result.err(InvalidLocalActorProfileError.create('displayName'));
  }
  if (bio !== undefined && !bioSchema.safeParse(bio).success) {
    return Result.err(InvalidLocalActorProfileError.create('bio'));
  }
  return Result.ok({
    ...(displayName === undefined ? {} : { displayName: displayName === '' ? null : displayName }),
    ...(bio === undefined ? {} : { bio: bio === '' ? null : bio }),
  });
};

export const LocalActorProfile = {
  displayNameSchema,
  bioSchema,
  validate,
} as const;
