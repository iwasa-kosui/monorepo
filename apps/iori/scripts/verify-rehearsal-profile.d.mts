import type { KeyObject } from 'node:crypto';
export const REHEARSAL_SIGNING_PREFIX: string;
export function verifyRehearsalEnvelope(envelopeText: string, publicKey: KeyObject, mainSha: string): string;
