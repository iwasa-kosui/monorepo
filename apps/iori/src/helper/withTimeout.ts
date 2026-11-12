export const timedOut = Symbol('timedOut');

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof timedOut> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<typeof timedOut>((resolve) => {
      timer = setTimeout(() => resolve(timedOut), ms);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
