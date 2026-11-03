export type GenerationRef = { current: number | null };

export const currentGeneration = (ref: GenerationRef): number => ref.current ?? 0;

export const startGeneration = (ref: GenerationRef): number => {
  const next = currentGeneration(ref) + 1;
  ref.current = next;
  return next;
};

export const isStaleGeneration = (ref: GenerationRef, generation: number): boolean =>
  currentGeneration(ref) !== generation;
