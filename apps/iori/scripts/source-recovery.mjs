import { waitForRetry, writeDiagnostic } from './deploy-source.mjs';

export const createStageRunner = () => {
  const current = { program: 'none', stderr: '' };
  const stage = async (name, operation) => {
    current.program = 'none';
    current.stderr = '';
    try {
      return await operation();
    } catch (error) {
      writeDiagnostic(name, current.program, error, current.stderr);
      throw error;
    }
  };
  return { current, stage };
};
export const readSourceStatus = async (source, signal, { timeoutMs, intervalMs }) => {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      return await source.status(signal);
    } catch (error) {
      if (error?.retryable !== true || Date.now() + intervalMs > deadline) throw error;
      await waitForRetry(intervalMs, signal);
    }
  }
};
