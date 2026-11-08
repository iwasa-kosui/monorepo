import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { User, UserResolverByUsername } from '../../domain/user/user.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { DAILY_DIGEST_USERNAME } from '../../scheduled/digestTasks.ts';
import { IsDigestOwner } from '../isDigestOwner.ts';

const owner: User = { id: UserId.generate(), username: Username.parseOrThrow(DAILY_DIGEST_USERNAME) };

const create = (found: User | undefined) => {
  const resolve = vi.fn<UserResolverByUsername['resolve']>(async () => RA.ok(found));
  return { resolve, isDigestOwner: IsDigestOwner.create({ userResolverByUsername: { resolve } }) };
};

describe('IsDigestOwner', () => {
  it('ダイジェストの対象ユーザーの ID だけを所有者として認める', async () => {
    const { resolve, isDigestOwner } = create(owner);

    expect(await isDigestOwner(owner.id)).toBe(true);
    expect(await isDigestOwner(UserId.generate())).toBe(false);
    expect(resolve).toHaveBeenCalledWith(DAILY_DIGEST_USERNAME);
  });

  it('ユーザー ID が無いときは所有者を引かずに認めない', async () => {
    const { resolve, isDigestOwner } = create(owner);

    expect(await isDigestOwner(undefined)).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('対象ユーザーが見つからないときは誰も認めない', async () => {
    const { isDigestOwner } = create(undefined);

    expect(await isDigestOwner(owner.id)).toBe(false);
  });
});
