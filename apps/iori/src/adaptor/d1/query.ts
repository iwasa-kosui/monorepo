import type { ResultAsync } from '@iwasa-kosui/result';
import { RA } from '@iwasa-kosui/result';

export const mapD1Error = (error: unknown): Error => error instanceof Error ? error : new Error(String(error));

export const fromD1 = <T>(
  run: () => Promise<T>,
): ResultAsync<T, Error> => RA.try(run, mapD1Error)();
