import { exportJwk, generateCryptoKeyPair } from "@fedify/fedify";
import { RA } from "@iwasa-kosui/result";

import type { Instant } from "../../domain/instant/instant.ts";
import type { KeyGenerated, KeyGenerator } from "../../domain/key/generate.ts";
import { Key } from "../../domain/key/key.ts";
import type { KeyType } from "../../domain/key/keyType.ts";
import type { UserId } from "../../domain/user/userId.ts";
import { singleton } from "../../helper/singleton.ts";

type Props = Readonly<{
  type: KeyType;
  userId: UserId;
  now: Instant;
}>

const generate = async (props: Props): RA<KeyGenerated, never> => {
  const keyPair = await generateCryptoKeyPair(props.type)
  const [privateJwk, publicJwk] = await Promise.all([
    exportJwk(keyPair.privateKey),
    exportJwk(keyPair.publicKey),
  ]);
  const keyGenerated = Key.generate(props.now)({
    type: props.type,
    userId: props.userId,
    privateKey: JSON.stringify(privateJwk),
    publicKey: JSON.stringify(publicJwk),
  });
  return RA.ok(keyGenerated);
}

const getInstance = singleton((): KeyGenerator => ({
  generate,
}));

export const FedifyKeyGenerator = {
  getInstance,
} as const;
