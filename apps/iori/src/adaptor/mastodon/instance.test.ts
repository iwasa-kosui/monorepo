import { describe, expect, it } from 'vitest';

import { type Account, InstanceV1Schema, InstanceV2Schema } from './entities.ts';
import { buildInstanceV1, buildInstanceV2 } from './instance.ts';

const contactAccount: Account = {
  id: 'actor-id',
  username: 'kosui',
  acct: 'kosui',
  url: 'https://iori.example/users/kosui',
  uri: 'https://iori.example/users/kosui',
  display_name: 'kosui',
  note: '',
  avatar: 'https://iori.example/static/avatar.png',
  avatar_static: 'https://iori.example/static/avatar.png',
  header: 'https://iori.example/static/header.png',
  header_static: 'https://iori.example/static/header.png',
  locked: false,
  fields: [],
  emojis: [],
  bot: false,
  group: false,
  discoverable: null,
  indexable: false,
  hide_collections: null,
  created_at: '2025-01-01T00:00:00.000Z',
  last_status_at: null,
  statuses_count: 0,
  followers_count: 0,
  following_count: 0,
};

const props = {
  domain: 'iori.example',
  title: 'iori',
  description: 'A single user server',
  ioriVersion: '1.2.3',
  contactAccount,
  vapidPublicKey: 'BKey',
};

describe('buildInstanceV2', () => {
  it('builds an InstanceV2 that passes the schema', () => {
    const instance = buildInstanceV2(props);

    expect(InstanceV2Schema.safeParse(instance).success).toBe(true);
    expect(instance.version).toBe('4.3.0 (compatible; iori 1.2.3)');
    expect(instance.configuration.urls).not.toHaveProperty('streaming');
  });

  it('omits configuration.vapid when there is no key', () => {
    const instance = buildInstanceV2({ ...props, vapidPublicKey: null });

    expect(InstanceV2Schema.safeParse(instance).success).toBe(true);
    expect(instance.configuration).not.toHaveProperty('vapid');
  });
});

describe('buildInstanceV1', () => {
  it('builds an InstanceV1 that passes the schema', () => {
    const instance = buildInstanceV1(props);

    expect(InstanceV1Schema.safeParse(instance).success).toBe(true);
    expect(instance.version).toBe('4.3.0 (compatible; iori 1.2.3)');
  });

  it('omits configuration.vapid when there is no key', () => {
    const instance = buildInstanceV1({ ...props, vapidPublicKey: null });

    expect(instance.configuration).not.toHaveProperty('vapid');
  });
});
