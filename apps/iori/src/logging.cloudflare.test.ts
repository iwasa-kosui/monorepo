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

  it('writes the failure debug records of the fedify LD signature logger', async () => {
    await import('./logging.cloudflare.ts');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const ld = getLogger(['fedify', 'sig', 'ld']);
    const sig = {
      type: 'RsaSignature2017',
      creator: 'https://remote.example/users/alice#main-key',
      created: '2026-11-04T00:00:00Z',
      signatureValue: 'c2lnbmF0dXJl',
    };

    ld.debug(
      'Failed to verify with the cached key {keyId}; signature {signatureValue} is invalid.  Retrying with the freshly fetched key...',
      { keyId: sig.creator, ...sig },
    );
    expect(debug).toHaveBeenCalledTimes(1);

    ld.debug(
      'Failed to verify with the fetched key {keyId}; signature {signatureValue} is invalid.  Check if the key is correct or if the signed message is correct.  The message to sign is:\n{message}',
      { keyId: sig.creator, ...sig, message: 'hash' },
    );
    expect(debug).toHaveBeenCalledTimes(2);

    ld.debug('Key {keyId} has no owner.', { keyId: 'https://relay.example/actor#main-key' });
    expect(debug).toHaveBeenCalledTimes(3);

    ld.debug('Some attributions are not authenticated by the Linked Data Signatures: {attributions}.', {
      attributions: ['https://remote.example/users/alice'],
    });
    expect(debug).toHaveBeenCalledTimes(4);
  });

  it('drops the other debug records of the fedify LD signature logger', async () => {
    await import('./logging.cloudflare.ts');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const ld = getLogger(['fedify', 'sig', 'ld']);

    ld.debug('Failed to verify; invalid base64 signatureValue: {signatureValue}', {
      type: 'RsaSignature2017',
      creator: 'https://remote.example/users/alice#main-key',
      signatureValue: '%%%',
      error: new Error('x'),
    });
    ld.debug('Some unrelated debug record with {document}', { document: { content: 'post body' } });

    expect(debug).not.toHaveBeenCalled();
  });

  it('writes only the fetch failure debug records of the fedify key logger', async () => {
    await import('./logging.cloudflare.ts');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const key = getLogger(['fedify', 'sig', 'key']);
    const keyId = 'https://relay.example/actor#main-key';

    key.debug('Failed to fetch key {keyId}.', { keyId });
    expect(debug).toHaveBeenCalledTimes(1);

    key.debug('Failed to verify; key {keyId} returned an invalid object.', { keyId });
    expect(debug).toHaveBeenCalledTimes(2);

    key.debug('Key {keyId} found in cache.', { keyId });
    key.debug('Fetching key {keyId} to verify signature...', { keyId });
    expect(debug).toHaveBeenCalledTimes(2);
  });

  it('writes the key resolution failure debug records of the fedify key logger', async () => {
    await import('./logging.cloudflare.ts');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const key = getLogger(['fedify', 'sig', 'key']);
    const keyId = 'https://relay.example/actor#main-key';

    key.debug('Entry {keyId} found in cache, but it is unavailable.', { keyId });
    expect(debug).toHaveBeenCalledTimes(1);

    key.debug('Failed to decode key {keyId}: {error}', { keyId, failure: 'invalid', error: new Error('x') });
    expect(debug).toHaveBeenCalledTimes(2);

    key.debug('Failed to verify; object {keyId} returned an {actorType}, but has no key matching {keyId}.', {
      keyId,
      actorType: 'Application',
    });
    expect(debug).toHaveBeenCalledTimes(3);

    key.debug('Failed to verify; key {keyId} has no publicKeyPem field.', { keyId });
    expect(debug).toHaveBeenCalledTimes(4);

    key.debug(
      'Failed to verify; the document served at {documentUrl} claims to be the actor {actorId}, which belongs to another origin.',
      { keyId, documentUrl: 'https://relay.example/actor', actorId: 'https://other.example/actor' },
    );
    expect(debug).toHaveBeenCalledTimes(5);
  });

  it('writes the key owner verification failure debug records of the fedify key logger', async () => {
    await import('./logging.cloudflare.ts');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const key = getLogger(['fedify', 'sig', 'key']);
    const properties = {
      keyId: 'https://relay.example/actor#main-key',
      claimedOwnerId: 'https://other.example/actor',
    };

    key.debug(
      'Failed to verify; the owner {claimedOwnerId} that key {keyId} claims does not list the key as its own.',
      properties,
    );
    expect(debug).toHaveBeenCalledTimes(1);

    key.debug('The owner ({claimedOwnerId}) that key {keyId} claims could not be resolved.', properties);
    expect(debug).toHaveBeenCalledTimes(2);

    key.debug('The owner ({claimedOwnerId}) that key {keyId} claims does not list the key as its own.', properties);
    expect(debug).toHaveBeenCalledTimes(3);
  });

  it('writes only the LD signature debug records of the fedify inbox logger', async () => {
    await import('./logging.cloudflare.ts');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const inbox = getLogger(['fedify', 'federation', 'inbox']);

    inbox.debug(
      'Failed to normalize JSON-LD for Linked Data Signatures; deferring to another authentication path only if it verifies:\n{error}',
      { recipient: 'alice', error: new Error('x') },
    );
    expect(debug).toHaveBeenCalledTimes(1);

    inbox.debug('Linked Data Signatures are not verified.', {
      recipient: 'alice',
      json: { content: 'post body', signature: { type: 'RsaSignature2017' } },
    });
    expect(debug).toHaveBeenCalledTimes(2);

    inbox.debug('Activity {activityId} is not verified.', { activityId: 'https://remote.example/activities/1' });
    inbox.debug('Some unrelated debug record with {json}', { json: { content: 'post body' } });
    expect(debug).toHaveBeenCalledTimes(2);
  });

  it('drops the not verified record of the fedify inbox logger when the activity has no signature key', async () => {
    await import('./logging.cloudflare.ts');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const inbox = getLogger(['fedify', 'federation', 'inbox']);

    inbox.debug('Linked Data Signatures are not verified.', { recipient: 'alice', json: { content: 'post body' } });

    expect(debug).not.toHaveBeenCalled();
  });

  it('drops the not verified record of the fedify inbox logger when json is missing or not an object', async () => {
    await import('./logging.cloudflare.ts');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const inbox = getLogger(['fedify', 'federation', 'inbox']);

    inbox.debug('Linked Data Signatures are not verified.', { recipient: 'alice' });
    inbox.debug('Linked Data Signatures are not verified.', { recipient: 'alice', json: null });
    inbox.debug('Linked Data Signatures are not verified.', { recipient: 'alice', json: 'signature' });
    inbox.debug('Linked Data Signatures are not verified.', { recipient: 'alice', json: [{ signature: {} }] });

    expect(debug).not.toHaveBeenCalled();
  });

  it('writes info and above of the fedify inbox logger once each', async () => {
    await import('./logging.cloudflare.ts');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const inbox = getLogger(['fedify', 'federation', 'inbox']);

    inbox.info('inbox info');
    inbox.warn('inbox warn');
    inbox.error('inbox error');

    expect(info).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it('writes info and above of the fedify key logger once each', async () => {
    await import('./logging.cloudflare.ts');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const key = getLogger(['fedify', 'sig', 'key']);

    key.info('key info');
    key.warn('key warn');
    key.error('key error');

    expect(info).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it('writes info and above of the fedify LD signature logger once each', async () => {
    await import('./logging.cloudflare.ts');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ld = getLogger(['fedify', 'sig', 'ld']);

    ld.info('ld info');
    ld.warn('ld warn');
    ld.error('ld error');

    expect(info).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it('does not write debug of the fedify HTTP signature and federation loggers', async () => {
    await import('./logging.cloudflare.ts');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    getLogger(['fedify', 'sig', 'http']).debug('Key {keyId} has no owner.', { keyId: 'k' });
    getLogger(['fedify', 'federation']).debug('Key {keyId} has no owner.', { keyId: 'k' });

    expect(debug).not.toHaveBeenCalled();
  });
});
