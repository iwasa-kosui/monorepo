/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ResultAsync } from '@iwasa-kosui/result';

export type UseCase<Input, Ok, Err> = Readonly<{
  run: (input: Input) => ResultAsync<Ok, Err>;
}>;

export type InferUseCaseError<T> = T extends UseCase<any, any, infer E> ? E : never;
