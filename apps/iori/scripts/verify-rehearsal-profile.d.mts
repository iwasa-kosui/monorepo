import type { KeyObject } from 'node:crypto';
export function verifyRehearsalEnvelope(envelopeText: string, publicKey: KeyObject, mainSha: string): string;
