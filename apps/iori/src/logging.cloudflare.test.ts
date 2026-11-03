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
});
