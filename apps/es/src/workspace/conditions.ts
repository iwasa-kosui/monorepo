import type { Condition, SignalName, SignalRef } from './scenario';

export type FiredSignals = ReadonlyMap<SignalName, ReadonlySet<string>>;

export const keyOf = (data: Readonly<Record<string, unknown>> | undefined): string => {
  const key = data?.['key'];
  return typeof key === 'string' ? key : '';
};

export const record = (fired: Map<SignalName, Set<string>>, name: SignalName, key: string): void => {
  const keys = fired.get(name) ?? new Set<string>();
  keys.add(key);
  fired.set(name, keys);
};

export const hasFired = (fired: FiredSignals, ref: SignalRef): boolean => {
  if (typeof ref === 'string') {
    return fired.has(ref);
  }
  return fired.get(ref.name)?.has(ref.key) ?? false;
};

export const isMet = (fired: FiredSignals, condition: Condition): boolean => {
  if (typeof condition === 'string' || 'name' in condition) {
    return hasFired(fired, condition);
  }
  if ('all' in condition) {
    return condition.all.every((item) => isMet(fired, item));
  }
  return condition.any.some((item) => isMet(fired, item));
};

export const unmet = <T extends { readonly signal: SignalRef }>(
  fired: FiredSignals,
  requirements: readonly T[],
): T[] => requirements.filter((item) => !hasFired(fired, item.signal));
