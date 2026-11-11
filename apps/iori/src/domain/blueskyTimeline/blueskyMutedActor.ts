import type { RA } from '@iwasa-kosui/result';

/**
 * Bluesky 側でミュートしているアカウントの DID。
 * 直接ミュートしたアカウントと、ミュートしているモデレーションリストのメンバーの両方を含む。
 */
export type BlueskyMutedActorsSyncedStore = Readonly<{
  sync: (dids: readonly string[]) => RA<Readonly<{ added: number; removed: number }>, never>;
}>;
