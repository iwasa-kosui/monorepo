export const singleton = <T>(factory: () => T): () => T => {
  let instance: T | null = null;
  return () => {
    if (instance === null) {
      instance = factory();
    }
    return instance;
  };
};
