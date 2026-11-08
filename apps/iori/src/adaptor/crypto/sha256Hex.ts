import type { AggregateIdHasher } from '../../domain/domainEvent/domainEventArchive.ts';

const encoder = new TextEncoder();

export const sha256Hex: AggregateIdHasher = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
