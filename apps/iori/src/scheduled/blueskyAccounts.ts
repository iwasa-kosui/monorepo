import { createD1BlueskyAccountSwitchingUserIdsResolver } from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchResolver.ts';
import { createD1Db } from '../adaptor/d1/client.ts';
import {
  type BlueskyAccountConfig,
  createBlueskyAccounts,
  resolveBlueskyRuntimeConfig,
} from '../runtime/blueskyCredential.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';

export type BlueskyAccountsLister = (env: IoriWorkerEnv) => Promise<readonly BlueskyAccountConfig[]>;

/**
 * 定期実行で同期する Bluesky のアカウント。つないでいるユーザーのうち、アカウントを切り替えている途中の人は
 * 古いアカウントのデータを消し終えるまで同期しない
 */
export const listActiveBlueskyAccounts: BlueskyAccountsLister = async (env) => {
  const config = resolveBlueskyRuntimeConfig(env);
  if (config === undefined) return [];
  const db = createD1Db(env.DB);
  const [accounts, switching] = await Promise.all([
    createBlueskyAccounts(config, db).linkedConfigs(),
    createD1BlueskyAccountSwitchingUserIdsResolver(db).resolve(),
  ]);
  const switchingUserIds = new Set<string>(switching);
  if (switchingUserIds.size > 0) {
    console.info(JSON.stringify({ event: 'bluesky_account_switch_users_skipped', count: switchingUserIds.size }));
  }
  return accounts.filter((account) => !switchingUserIds.has(account.userId));
};

/** ユーザーごとに順に動かす。1 人の失敗で、ほかの人の同期を止めない */
export const forEachBlueskyAccount = async (
  accounts: readonly BlueskyAccountConfig[],
  label: string,
  run: (account: BlueskyAccountConfig) => Promise<void>,
): Promise<void> => {
  for (const account of accounts) {
    try {
      await run(account);
    } catch (error) {
      console.error(`iori ${label}: failed for a user.`, { userId: account.userId, error });
    }
  }
};
