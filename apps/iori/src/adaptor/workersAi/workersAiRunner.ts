export type WorkersAiRunner = Readonly<{
  run: (model: string, inputs: Record<string, unknown>) => Promise<unknown>;
}>;
