import { type Decision, initialDecision } from './choice';

export type DecisionStore = {
  readonly get: () => Decision;
  readonly set: (next: Decision) => void;
  readonly subscribe: (listener: () => void) => void;
};

const stores = new WeakMap<object, DecisionStore>();

const createStore = (): DecisionStore => {
  let current = initialDecision;
  const listeners: (() => void)[] = [];
  return {
    get: () => current,
    set: (next) => {
      if (next === current) return;
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.push(listener);
    },
  };
};

export const decisionStoreOf = (owner: object): DecisionStore => {
  const found = stores.get(owner);
  if (found !== undefined) return found;
  const created = createStore();
  stores.set(owner, created);
  return created;
};
