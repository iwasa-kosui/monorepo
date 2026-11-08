import type { Instant } from '../instant/instant.ts';
import type { PostId } from '../post/postId.ts';

const BASE32_SORTABLE = '234567abcdefghijklmnopqrstuvwxyz';
const TID_LENGTH = 13;
const CLOCK_ID_BITS = 10n;
const CLOCK_ID_MASK = (1n << CLOCK_ID_BITS) - 1n;

const clockIdOf = (postId: PostId): bigint => {
  let hash = 0x811c9dc5;
  for (const character of postId) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return BigInt(hash) & CLOCK_ID_MASK;
};

export const blueskyRkeyOf = (input: Readonly<{ postId: PostId; createdAt: Instant }>): string => {
  const microseconds = BigInt(Math.trunc(input.createdAt)) * 1000n;
  let value = (microseconds << CLOCK_ID_BITS) | clockIdOf(input.postId);
  let rkey = '';
  for (let index = 0; index < TID_LENGTH; index += 1) {
    rkey = BASE32_SORTABLE[Number(value & 31n)] + rkey;
    value >>= 5n;
  }
  return rkey;
};
