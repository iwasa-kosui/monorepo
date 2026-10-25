// Fixed CLI entrypoints translate OS termination into the same awaited operation cleanup.
export const withCliSignal = async (operation, { timeoutMs = 345 * 60_000 } = {}) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 345 * 60_000) {
    throw new Error('Invalid CLI deadline.');
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  const timer = setTimeout(stop, timeoutMs);
  for (const event of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(event, stop);
  try {
    const result = await operation(controller.signal);
    controller.signal.throwIfAborted();
    return result;
  } finally {
    clearTimeout(timer);
    for (const event of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.removeListener(event, stop);
  }
};
