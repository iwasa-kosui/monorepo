import type { ResultAsync } from "@iwasa-kosui/result";

export type UseCase<Input, Ok, Err> = Readonly<{
  run: (input: Input) => ResultAsync<Ok, Err>;
}>;
