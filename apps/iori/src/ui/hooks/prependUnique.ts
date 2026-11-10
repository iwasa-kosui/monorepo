export const prependUniqueById = <T extends Readonly<{ id: string }>>(
  existing: readonly T[],
  incoming: T,
): readonly T[] => existing.some((item) => item.id === incoming.id) ? existing : [incoming, ...existing];
