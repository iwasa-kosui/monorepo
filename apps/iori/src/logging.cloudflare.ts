import { configureSync, getConsoleSink } from '@logtape/logtape';
import { AsyncLocalStorage } from 'node:async_hooks';

const ldSignatureFailureDebugMessages: ReadonlySet<string> = new Set([
  'Failed to verify with the cached key {keyId}; signature {signatureValue} is invalid.  Retrying with the freshly fetched key...',
  'Failed to verify with the fetched key {keyId}; signature {signatureValue} is invalid.  Check if the key is correct or if the signed message is correct.  The message to sign is:\n{message}',
  'Key {keyId} has no owner.',
  'Some attributions are not authenticated by the Linked Data Signatures: {attributions}.',
]);

const keyFetchFailureDebugMessages: ReadonlySet<string> = new Set([
  'Failed to fetch key {keyId}.',
  'Failed to verify; key {keyId} returned an invalid object.',
  'Entry {keyId} found in cache, but it is unavailable.',
  'Failed to decode key {keyId}: {error}',
  'Failed to verify; object {keyId} returned an {actorType}, but has no key matching {keyId}.',
  'Failed to verify; key {keyId} has no publicKeyPem field.',
  'Failed to verify; the document served at {documentUrl} claims to be the actor {actorId}, which belongs to another origin.',
  'Failed to verify; the owner {claimedOwnerId} that key {keyId} claims does not list the key as its own.',
  'The owner ({claimedOwnerId}) that key {keyId} claims could not be resolved.',
  'The owner ({claimedOwnerId}) that key {keyId} claims does not list the key as its own.',
]);

const inboxLdSignatureNormalizeFailureMessage =
  'Failed to normalize JSON-LD for Linked Data Signatures; deferring to another authentication path only if it verifies:\n{error}';
const inboxLdSignatureNotVerifiedMessage = 'Linked Data Signatures are not verified.';

const hasSignatureKey = (json: unknown): boolean =>
  typeof json === 'object' && json !== null && !Array.isArray(json) && 'signature' in json;

configureSync({
  reset: true,
  contextLocalStorage: new AsyncLocalStorage(),
  sinks: {
    console: getConsoleSink(),
  },
  filters: {
    onlyLdSignatureFailureDebug: (record) =>
      record.level !== 'debug'
      || (typeof record.rawMessage === 'string' && ldSignatureFailureDebugMessages.has(record.rawMessage)),
    onlyKeyFetchFailureDebug: (record) =>
      record.level !== 'debug'
      || (typeof record.rawMessage === 'string' && keyFetchFailureDebugMessages.has(record.rawMessage)),
    onlyInboxLdSignatureDebug: (record) =>
      record.level !== 'debug'
      || record.rawMessage === inboxLdSignatureNormalizeFailureMessage
      || (record.rawMessage === inboxLdSignatureNotVerifiedMessage && hasSignatureKey(record.properties.json)),
  },
  loggers: [
    // debug には署名や鍵の詳細が出るため info 以上に限る
    { category: [], lowestLevel: 'info', sinks: ['console'] },
    // relay から転送された Create の LD 署名の検証の失敗を切り分ける間だけ debug にする（配備から 1 週間以内に戻す）
    {
      category: ['fedify', 'sig', 'ld'],
      lowestLevel: 'debug',
      sinks: ['console'],
      parentSinks: 'override',
      filters: ['onlyLdSignatureFailureDebug'],
    },
    {
      category: ['fedify', 'sig', 'key'],
      lowestLevel: 'debug',
      sinks: ['console'],
      parentSinks: 'override',
      filters: ['onlyKeyFetchFailureDebug'],
    },
    {
      category: ['fedify', 'federation', 'inbox'],
      lowestLevel: 'debug',
      sinks: ['console'],
      parentSinks: 'override',
      filters: ['onlyInboxLdSignatureDebug'],
    },
    { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['console'], parentSinks: 'override' },
  ],
});
