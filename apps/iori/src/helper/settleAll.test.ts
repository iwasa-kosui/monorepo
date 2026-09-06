import { expect, it } from 'vitest';

import { settleAll } from './settleAll.ts';
it('does not propagate an early rejection while a sibling write remains active', async () => {
  const sibling = Promise.withResolvers<number>();
  let settled = false;
  const work = settleAll([Promise.reject(new Error('first failed')), sibling.promise]);
  const observed = work.catch((error) => {
    settled = true;
    throw error;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(false);
  sibling.resolve(2);
  await expect(observed).rejects.toThrow('first failed');
});
