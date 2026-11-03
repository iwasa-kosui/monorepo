export const appendUniqueBy = <T>(
  existing: readonly T[],
  incoming: readonly T[],
  keyOf: (item: T) => string,
): readonly T[] => {
  const seen = new Set(existing.map(keyOf));
  const added: T[] = [];
  for (const item of incoming) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(item);
  }
  return [...existing, ...added];
};

export const appendUniqueById = <T extends Readonly<{ id: string }>>(
  existing: readonly T[],
  incoming: readonly T[],
): readonly T[] => appendUniqueBy(existing, incoming, (item) => item.id);
