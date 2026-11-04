import { describe, expect, it } from 'vitest';

import { IORI_VERSION } from './ioriVersion.ts';
import { buildNodeInfo } from './nodeinfo.ts';

describe('buildNodeInfo', () => {
  it('describes iori over ActivityPub with closed registrations', () => {
    const nodeInfo = buildNodeInfo('1.2.3');

    expect(nodeInfo).toMatchObject({
      software: { name: 'iori', version: '1.2.3' },
      protocols: ['activitypub'],
      openRegistrations: false,
      usage: { users: { total: 1 } },
    });
  });

  it('accepts the version of package.json', () => {
    expect(IORI_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  });
});
