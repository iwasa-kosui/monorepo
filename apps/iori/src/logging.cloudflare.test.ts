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
});
