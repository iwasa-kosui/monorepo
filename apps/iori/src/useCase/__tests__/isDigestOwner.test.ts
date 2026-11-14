import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import type { User, UserResolverByUsername } from '../../domain/user/user.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { DAILY_DIGEST_USERNAME } from '../../scheduled/digestTasks.ts';
import { IsDigestOwner } from '../isDigestOwner.ts';

const owner: User = { id: UserId.generate(), username: Username.parseOrThrow(DAILY_DIGEST_USERNAME) };

const create = (found: User | undefined) => ({
  isDigestOwner: IsDigestOwner.create({
    userResolverByUsername: { resolve: async () => RA.ok(found) } as UserResolverByUsername,
  }),
});

describe('IsDigestOwner', () => {
  it('ダイジェストの対象ユーザーの ID だけを所有者として認める', async () => {
    const { isDigestOwner } = create(owner);

    expect(await isDigestOwner(owner.id)).toBe(true);
    expect(await isDigestOwner(UserId.generate())).toBe(false);
  });

  it('ユーザー ID が無いときは所有者を引かずに認めない', async () => {
    const { isDigestOwner } = create(owner);

    expect(await isDigestOwner(undefined)).toBe(false);
  });

  it('対象ユーザーが見つからないときは誰も認めない', async () => {
    const { isDigestOwner } = create(undefined);

    expect(await isDigestOwner(owner.id)).toBe(false);
  });
});
