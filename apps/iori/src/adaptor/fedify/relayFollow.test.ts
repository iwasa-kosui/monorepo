import { Follow } from '@fedify/fedify';
import { describe, expect, it } from 'vitest';

import { RelayFollow } from './relayFollow.ts';

const PUBLIC_IRI = 'https://www.w3.org/ns/activitystreams#Public';

const createValues = () => ({
  id: new URL('https://iori.example/#Follow/1'),
  actor: new URL('https://iori.example/users/instance.actor'),
  object: new URL(PUBLIC_IRI),
  to: new URL(PUBLIC_IRI),
});

describe('RelayFollow', () => {
  it('compact の JSON で object と to が完全な IRI の文字列になる', async () => {
    const json = await new RelayFollow(createValues()).toJsonLd({ format: 'compact' });

    expect(json).toMatchObject({
      type: 'Follow',
      actor: 'https://iori.example/users/instance.actor',
      object: PUBLIC_IRI,
      to: PUBLIC_IRI,
    });
  });

  it('object が Public 以外のとき、object と to をそのまま残す', async () => {
    const json = await new RelayFollow({
      ...createValues(),
      object: new URL('https://relay.example/actor'),
      to: new URL('https://relay.example/actor'),
    }).toJsonLd({ format: 'compact' });

    expect(json).toMatchObject({
      object: 'https://relay.example/actor',
      to: 'https://relay.example/actor',
    });
  });

  it('expand の JSON は Fedify の出力のまま', async () => {
    const values = createValues();
    const expanded = await new RelayFollow(values).toJsonLd({ format: 'expand' });

    expect(expanded).toEqual(await new Follow(values).toJsonLd({ format: 'expand' }));
  });

  it('clone しても RelayFollow のまま、出力も同じ', async () => {
    const cloned = new RelayFollow(createValues()).clone({ id: new URL('https://iori.example/#Follow/2') });

    expect(cloned).toBeInstanceOf(RelayFollow);
    expect(await cloned.toJsonLd({ format: 'compact' })).toMatchObject({ object: PUBLIC_IRI, to: PUBLIC_IRI });
  });
});
