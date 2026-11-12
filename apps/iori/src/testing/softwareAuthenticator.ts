import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { isoBase64URL, isoCBOR, isoUint8Array } from '@simplewebauthn/server/helpers';

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_BS = 0x10;
const FLAG_AT = 0x40;

const sha256 = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', data));

const counterBytes = (counter: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, counter);
  return bytes;
};

const derInteger = (raw: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  let start = 0;
  while (start < raw.length - 1 && raw[start] === 0) start += 1;
  const trimmed = raw.slice(start);
  const body = trimmed[0] >= 0x80 ? isoUint8Array.concat([new Uint8Array([0]), trimmed]) : trimmed;
  return isoUint8Array.concat([new Uint8Array([0x02, body.length]), body]) as Uint8Array<ArrayBuffer>;
};

const rawSignatureToDer = (signature: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const half = signature.length / 2;
  const body = isoUint8Array.concat([derInteger(signature.slice(0, half)), derInteger(signature.slice(half))]);
  return isoUint8Array.concat([new Uint8Array([0x30, body.length]), body]) as Uint8Array<ArrayBuffer>;
};

const clientDataJSON = (type: 'webauthn.create' | 'webauthn.get', challenge: string, origin: string) =>
  new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

export type SoftwareAuthenticator = Readonly<{
  credentialId: string;
  createRegistrationResponse: (
    params: Readonly<{
      challenge: string;
      origin: string;
      rpId: string;
      backupEligible?: boolean;
      backedUp?: boolean;
    }>,
  ) => Promise<RegistrationResponseJSON>;
  createAuthenticationResponse: (
    params: Readonly<{
      challenge: string;
      origin: string;
      rpId: string;
      counter?: number;
      userHandle?: string;
    }>,
  ) => Promise<AuthenticationResponseJSON>;
}>;

export const createSoftwareAuthenticator = async (): Promise<SoftwareAuthenticator> => {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const rawCredentialId = crypto.getRandomValues(new Uint8Array(16 + Math.floor(Math.random() * 17)));
  const credentialId = isoBase64URL.fromBuffer(rawCredentialId);
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const cosePublicKey = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, isoBase64URL.toBuffer(jwk.x!)],
      [-3, isoBase64URL.toBuffer(jwk.y!)],
    ]),
  );

  return {
    credentialId,
    createRegistrationResponse: async ({ challenge, origin, rpId, backupEligible, backedUp }) => {
      const flags = FLAG_UP | FLAG_UV | FLAG_AT | (backupEligible ? FLAG_BE : 0) | (backedUp ? FLAG_BS : 0);
      const credentialIdLength = new Uint8Array(2);
      new DataView(credentialIdLength.buffer).setUint16(0, rawCredentialId.length);
      const authData = isoUint8Array.concat([
        await sha256(new TextEncoder().encode(rpId)),
        new Uint8Array([flags]),
        counterBytes(0),
        new Uint8Array(16),
        credentialIdLength,
        rawCredentialId,
        cosePublicKey,
      ]);
      const attestationObject = isoCBOR.encode(
        new Map<string, string | Map<string, string> | Uint8Array>([
          ['fmt', 'none'],
          ['attStmt', new Map<string, string>()],
          ['authData', authData],
        ]),
      );
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON('webauthn.create', challenge, origin)),
          attestationObject: isoBase64URL.fromBuffer(attestationObject),
          transports: ['internal'],
        },
        clientExtensionResults: {},
      };
    },
    createAuthenticationResponse: async ({ challenge, origin, rpId, counter = 1, userHandle }) => {
      const authData = isoUint8Array.concat([
        await sha256(new TextEncoder().encode(rpId)),
        new Uint8Array([FLAG_UP | FLAG_UV]),
        counterBytes(counter),
      ]);
      const clientData = clientDataJSON('webauthn.get', challenge, origin);
      const signedData = isoUint8Array.concat([authData, await sha256(clientData)]) as Uint8Array<ArrayBuffer>;
      const signature = new Uint8Array(
        await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, signedData),
      );
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(clientData),
          authenticatorData: isoBase64URL.fromBuffer(authData),
          signature: isoBase64URL.fromBuffer(rawSignatureToDer(signature)),
          ...(userHandle === undefined ? {} : { userHandle }),
        },
        clientExtensionResults: {},
      };
    },
  };
};
