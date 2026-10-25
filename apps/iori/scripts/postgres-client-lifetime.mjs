// Own the connected client until cleanup settles, including errors emitted outside queries.
export const guardPostgresClient = (client, parentSignal) => {
  const failure = new AbortController();
  const signal = parentSignal ? AbortSignal.any([parentSignal, failure.signal]) : failure.signal;
  let closing;
  const close = () => closing ??= Promise.resolve().then(() => client.end());
  const abort = () => {
    close().catch(() => {});
  };
  // Keep this listener on the exclusively owned client even after end: late errors
  // must not become uncaught Node events. The client and listener are collected together.
  client.on?.('error', () => failure.abort(new Error('postgres_connection_failed')));
  signal.addEventListener('abort', abort, { once: true });
  return {
    signal,
    close,
    cleanup: async () => {
      try {
        await close();
      } finally {
        signal.removeEventListener('abort', abort);
      }
    },
  };
};
