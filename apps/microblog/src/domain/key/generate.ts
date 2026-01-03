import type { Instant } from "../instant/instant.ts";
import type { UserId } from "../user/userId.ts";
import type { Key } from "./key.ts";
import { KeyEvent } from "./aggregate.ts";
import { KeyId } from "./keyId.ts";
import type { KeyType } from "./keyType.ts";
import type { Agg } from "../aggregate/index.ts";
import type { RA } from "@iwasa-kosui/result";

type Payload = Readonly<{
  type: KeyType;
  userId: UserId;
  privateKey: string;
  publicKey: string;
}>

const eventName = 'key.created' as const;

export type KeyGenerated = KeyEvent<Key, typeof eventName, Payload>;

export const generate = (now: Instant) => (payload: Payload): KeyGenerated => {
  const keyId = KeyId.generate();
  const key = {
    id: keyId,
    type: payload.type,
    userId: payload.userId,
    privateKey: payload.privateKey,
    publicKey: payload.publicKey,
  } as const;
  return KeyEvent.create(keyId, key, eventName, payload, now);
}

export type KeyGeneratedStore = Agg.Store<KeyGenerated>;
export type KeyGenerator = Readonly<{
  generate: (props: Readonly<{
    type: KeyType;
    userId: UserId;
    now: Instant;
  }>) => RA<KeyGenerated, never>
}>;
