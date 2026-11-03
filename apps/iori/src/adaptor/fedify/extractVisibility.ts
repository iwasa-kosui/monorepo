import { Visibility } from '../../domain/post/visibility.ts';

export type Addressed = Readonly<{
  toIds: ReadonlyArray<URL>;
  ccIds: ReadonlyArray<URL>;
}>;

export const extractVisibility = (
  addressed: Addressed,
  followersId: URL | null | undefined,
): Visibility | null => {
  if (addressed.toIds.length === 0 && addressed.ccIds.length === 0) {
    return null;
  }
  return Visibility.fromAddressing({
    to: addressed.toIds.map((id) => id.href),
    cc: addressed.ccIds.map((id) => id.href),
    followersUri: followersId?.href,
  });
};
