export type UseCase<TInput, TOutput> = Readonly<{
  run: (input: TInput) => TOutput;
}>;
