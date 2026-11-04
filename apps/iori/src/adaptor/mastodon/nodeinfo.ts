import type { NodeInfo } from '@fedify/fedify';

export const buildNodeInfo = (ioriVersion: string): NodeInfo => ({
  software: {
    name: 'iori',
    version: ioriVersion,
  },
  protocols: ['activitypub'],
  openRegistrations: false,
  usage: {
    users: { total: 1 },
    localPosts: 0,
    localComments: 0,
  },
});
