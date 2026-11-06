import { RA } from '@iwasa-kosui/result';

import { blockedReason } from '../../domain/feedSource/feedSourceUrl.ts';
import { decodeBody } from './decodeBody.ts';

export const SAFE_FETCH_USER_AGENT = 'iori-digest/1.0 (+https://blog.kosui.me)';

export type SafeFetchOptions = Readonly<{
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  headers?: Readonly<Record<string, string>>;
}>;

export type SafeFetchResult = Readonly<{
  status: number;
  body?: string;
  etag: string | null;
  lastModified: string | null;
  finalUrl: string;
  contentType?: string;
}>;

export type SafeFetchErrorReason =
  | 'invalid_url'
  | 'blocked_url'
  | 'too_many_redirects'
  | 'too_large'
  | 'timeout'
  | 'http_status'
  | 'network';

export type SafeFetchError = Readonly<{
  type: 'SafeFetchError';
  reason: SafeFetchErrorReason;
  message: string;
  status?: number;
}>;

export type SafeFetcher = Readonly<{
  fetchText: (url: string, options: SafeFetchOptions) => RA<SafeFetchResult, SafeFetchError>;
}>;

type Deps = Readonly<{
  fetch?: typeof fetch;
  now?: () => Date;
}>;

const safeFetchError = (
  reason: SafeFetchErrorReason,
  message: string,
  status?: number,
): SafeFetchError => ({ type: 'SafeFetchError', reason, message, ...(status === undefined ? {} : { status }) });

const parseTarget = (value: string): URL | SafeFetchError => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return safeFetchError('invalid_url', `Invalid URL: ${value}`);
  }
  const reason = blockedReason(url);
  return reason === undefined ? url : safeFetchError('blocked_url', `${reason}: ${url.origin}`);
};

const isRedirect = (status: number): boolean => status >= 300 && status < 400 && status !== 304;

const readBody = async (
  response: Response,
  maxBytes: number,
): Promise<string | SafeFetchError> => {
  const declared = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    return safeFetchError('too_large', `Response is larger than ${maxBytes} bytes.`);
  }
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return safeFetchError('too_large', `Response is larger than ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decodeBody(bytes, response.headers.get('Content-Type'));
};

export const createSafeFetcher = (deps: Deps = {}): SafeFetcher => {
  const fetchImpl: typeof fetch = deps.fetch ?? ((input, init) => fetch(input, init));

  const fetchText = async (
    url: string,
    options: SafeFetchOptions,
  ): RA<SafeFetchResult, SafeFetchError> => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);
    try {
      let current = url;
      for (let redirects = 0;; redirects += 1) {
        const target = parseTarget(current);
        if (!(target instanceof URL)) return RA.err(target);
        const response = await fetchImpl(target.href, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': SAFE_FETCH_USER_AGENT, ...options.headers },
        });
        if (isRedirect(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get('Location');
          if (location === null) {
            return RA.err(safeFetchError('http_status', 'Redirect without Location.', response.status));
          }
          if (redirects >= options.maxRedirects) {
            return RA.err(safeFetchError('too_many_redirects', `More than ${options.maxRedirects} redirects.`));
          }
          try {
            current = new URL(location, target).href;
          } catch {
            return RA.err(safeFetchError('invalid_url', `Invalid redirect location: ${location}`));
          }
          continue;
        }
        const contentType = response.headers.get('Content-Type') ?? undefined;
        const meta = {
          status: response.status,
          etag: response.headers.get('ETag'),
          lastModified: response.headers.get('Last-Modified'),
          finalUrl: target.href,
          ...(contentType === undefined ? {} : { contentType }),
        };
        if (response.status === 304) {
          await response.body?.cancel();
          return RA.ok(meta);
        }
        if (!response.ok) {
          await response.body?.cancel();
          return RA.err(safeFetchError('http_status', `Unexpected status ${response.status}.`, response.status));
        }
        const body = await readBody(response, options.maxBytes);
        return typeof body === 'string' ? RA.ok({ ...meta, body }) : RA.err(body);
      }
    } catch (error) {
      if (timedOut) return RA.err(safeFetchError('timeout', `Timed out after ${options.timeoutMs} ms.`));
      return RA.err(safeFetchError('network', error instanceof Error ? error.message : String(error)));
    } finally {
      clearTimeout(timer);
    }
  };

  return { fetchText };
};
