import type { DocumentLoader } from '@fedify/vocab-runtime';

export const signalWithTimeout = (overall: AbortSignal, fetchTimeoutMs: number): AbortSignal =>
  AbortSignal.any([overall, AbortSignal.timeout(fetchTimeoutMs)]);

export const withFetchTimeout = (
  loader: DocumentLoader,
  overall: AbortSignal,
  fetchTimeoutMs: number,
): DocumentLoader =>
(url, options) =>
  loader(url, {
    ...options,
    signal: AbortSignal.any(
      options?.signal === undefined
        ? [overall, AbortSignal.timeout(fetchTimeoutMs)]
        : [overall, options.signal, AbortSignal.timeout(fetchTimeoutMs)],
    ),
  });
