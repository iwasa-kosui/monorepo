import type { LockPort } from '../../domain/lock-port.ts';

// LockService.tryLock(0) は即時失敗を意味する。
const LOCK_WAIT_MS = 0;

export const GasLockService = {
  create: (): LockPort => ({
    tryRun: (fn) => {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(LOCK_WAIT_MS)) return false;
      try {
        fn();
      } finally {
        lock.releaseLock();
      }
      return true;
    },
  }),
} as const;
