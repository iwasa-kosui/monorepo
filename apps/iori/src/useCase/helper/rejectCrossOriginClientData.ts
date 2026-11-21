import { RA } from '@iwasa-kosui/result';
import { decodeClientDataJSON } from '@simplewebauthn/server/helpers';

import { PasskeyVerificationFailedError } from '../../domain/passkey/passkeyCredential.ts';

const isCrossOrigin = (clientDataJSON: string): boolean | undefined => {
  try {
    return decodeClientDataJSON(clientDataJSON).crossOrigin === true;
  } catch {
    return undefined;
  }
};

/**
 * iori はほかのオリジンの iframe の中でパスキーを使うことを想定しない。
 * WebAuthn は crossOrigin が true の応答を、RP がそれを想定するときだけ受け入れるよう求めるので、ここで拒む。
 */
export const rejectCrossOriginClientData = (clientDataJSON: string): RA<undefined, PasskeyVerificationFailedError> => {
  const crossOrigin = isCrossOrigin(clientDataJSON);
  if (crossOrigin === undefined) {
    return RA.err(PasskeyVerificationFailedError.create('The client data could not be decoded.'));
  }
  return crossOrigin
    ? RA.err(PasskeyVerificationFailedError.create('The response was created in a cross-origin iframe.'))
    : RA.ok(undefined);
};
