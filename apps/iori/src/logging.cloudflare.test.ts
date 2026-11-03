import { getLogger } from '@logtape/logtape';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('logging.cloudflare', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('can be imported repeatedly without throwing', async () => {
    await import('./logging.cloudflare.ts');
    vi.resetModules();

    await expect(import('./logging.cloudflare.ts')).resolves.toBeDefined();
  });

  it('writes info and above of fedify and app loggers to the console without debug', async () => {
    await import('./logging.cloudflare.ts');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    getLogger(['fedify', 'sig']).debug('signature detail');
    getLogger(['fedify', 'federation', 'outbox']).warn('Failed to send activity');
    getLogger().info('app root info');
    getLogger('iori:sign-in').info('app category info');

    expect(debug).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledTimes(2);
  });

  it('writes debug of the fedify http signature logger without request headers', async () => {
    await import('./logging.cloudflare.ts');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const logger = getLogger(['fedify', 'sig', 'http']);

    logger.debug('Failed to verify with the spec {spec} ({status} {statusText})', {
      spec: 'rfc9421',
      status: 400,
      statusText: 'Bad Request',
    });
    logger.debug('Failed to verify; required headers missing in the Signature header: {headers}.', {
      headers: '(request-target) date',
    });

    expect(debug).toHaveBeenCalledTimes(2);
  });

  it('drops debug records of the fedify http signature logger that carry request headers', async () => {
    await import('./logging.cloudflare.ts');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    getLogger(['fedify', 'sig', 'http']).debug('Failed to verify; no Signature header found.', {
      headers: { authorization: 'Bearer secret', cookie: 'session=secret' },
    });

    expect(debug).not.toHaveBeenCalled();
  });

  it('writes info and above of the fedify http signature logger once', async () => {
    await import('./logging.cloudflare.ts');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    getLogger(['fedify', 'sig', 'http']).error('Failed to verify; the request body is locked.', {
      url: 'https://example.com/inbox',
    });
    getLogger(['fedify', 'sig', 'http']).info('info record');

    expect(error).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledOnce();
  });

  it('does not write debug of other fedify signature and federation loggers', async () => {
    await import('./logging.cloudflare.ts');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    getLogger(['fedify', 'sig', 'key']).debug('Key {keyId} found in cache.', { keyId: 'https://example.com/key' });
    getLogger(['fedify', 'federation']).debug('federation detail');

    expect(debug).not.toHaveBeenCalled();
  });
});
