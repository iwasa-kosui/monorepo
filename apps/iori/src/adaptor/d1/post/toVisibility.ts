import { Visibility } from '../../../domain/post/visibility.ts';

export const toVisibility = (column: string | null): Visibility | null =>
  column === null ? null : Visibility.parseOrThrow(column);
