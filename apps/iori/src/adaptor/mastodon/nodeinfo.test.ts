import { describe, expect, it } from 'vitest';

import { IORI_VERSION } from './ioriVersion.ts';
import { buildNodeInfo } from './nodeinfo.ts';

describe('buildNodeInfo', () => {
  it('describes iori over ActivityPub with closed registrations', () => {
    const nodeInfo = buildNodeInfo('1.2.3');

    expect(nodeInfo).toMatchObject({
      software: { name: 'iori', version: { major: 1, minor: 2, patch: 3 } },
      protocols: ['activitypub'],
      openRegistrations: false,
      usage: { users: { total: 1 } },
    });
  });

  it('accepts the version of package.json', () => {
    expect(() => buildNodeInfo(IORI_VERSION)).not.toThrow();
  });
});
