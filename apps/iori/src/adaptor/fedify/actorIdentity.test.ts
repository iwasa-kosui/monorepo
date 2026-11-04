import { Application, Emoji, Group, Image, Person, PropertyValue, Service } from '@fedify/vocab';
import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it, vi } from 'vitest';

import { ActorIdentity, PROFILE_LIMITS } from './actorIdentity.ts';

const id = new URL('https://remote.example/users/alice');
const inbox = new URL('https://remote.example/users/alice/inbox');

const identityOf = async (actor: Person | Service | Application | Group) => {
  const result = await ActorIdentity.fromFedifyActor(actor);
  if (!result.ok) throw new Error(result.err.message);
  return result.val;
};

describe('ActorIdentity.fromFedifyActor のプロフィール', () => {
  it('Person の表示名・概要・ヘッダー・公開日時・フォロー承認制・項目・絵文字を読む', async () => {
    const actor = new Person({
      id,
      inbox,
      preferredUsername: 'alice',
      name: 'Alice',
      summary: '<p>hello</p>',
      icon: new Image({ url: new URL('https://remote.example/avatar.png') }),
      image: new Image({ url: new URL('https://remote.example/header.png') }),
      published: Temporal.Instant.from('2024-01-02T03:04:05Z'),
      manuallyApprovesFollowers: true,
      attachments: [new PropertyValue({ name: 'Web', value: '<a href="https://alice.example">alice</a>' })],
      tags: [new Emoji({ name: ':blob:', icon: new Image({ url: new URL('https://remote.example/blob.png') }) })],
    });

    const identity = await identityOf(actor);

    expect(identity.logoUri).toBe('https://remote.example/avatar.png');
    expect(identity.profile).toEqual({
      displayName: 'Alice',
      summary: '<p>hello</p>',
      headerUri: 'https://remote.example/header.png',
      actorType: 'Person',
      manuallyApprovesFollowers: true,
      publishedAt: Date.UTC(2024, 0, 2, 3, 4, 5),
      fields: [{ name: 'Web', value: '<a href="https://alice.example">alice</a>' }],
      emojis: [{ shortcode: 'blob', url: 'https://remote.example/blob.png' }],
    });
  });

  it('Service の actorType を読み、値がないものは null と空配列にする', async () => {
    const identity = await identityOf(new Service({ id, inbox }));

    expect(identity.profile).toEqual({
      displayName: null,
      summary: null,
      headerUri: null,
      actorType: 'Service',
      manuallyApprovesFollowers: null,
      publishedAt: null,
      fields: [],
      emojis: [],
    });
  });

  it('Application と Group の actorType を読む', async () => {
    expect((await identityOf(new Application({ id, inbox }))).profile?.actorType).toBe('Application');
    expect((await identityOf(new Group({ id, inbox }))).profile?.actorType).toBe('Group');
  });

  it('表示名は 200 字、概要は 1 万字で切り詰める', async () => {
    const identity = await identityOf(
      new Person({ id, inbox, name: 'あ'.repeat(300), summary: 'x'.repeat(PROFILE_LIMITS.summary + 5) }),
    );

    expect(Array.from(identity.profile?.displayName ?? '')).toHaveLength(PROFILE_LIMITS.displayName);
    expect(identity.profile?.summary).toHaveLength(PROFILE_LIMITS.summary);
  });

  it('プロフィール項目は 16 件、絵文字は 50 件までにする', async () => {
    const identity = await identityOf(
      new Person({
        id,
        inbox,
        attachments: Array.from({ length: 20 }, (_, i) => new PropertyValue({ name: `k${i}`, value: `v${i}` })),
        tags: Array.from(
          { length: 60 },
          (_, i) =>
            new Emoji({ name: `:e${i}:`, icon: new Image({ url: new URL(`https://remote.example/e${i}.png`) }) }),
        ),
      }),
    );

    expect(identity.profile?.fields).toHaveLength(PROFILE_LIMITS.fields);
    expect(identity.profile?.emojis).toHaveLength(PROFILE_LIMITS.emojis);
  });

  it('プロフィール項目の name は 255 字、value は 2048 字で切り詰める', async () => {
    const identity = await identityOf(
      new Person({
        id,
        inbox,
        attachments: [new PropertyValue({ name: 'n'.repeat(300), value: 'v'.repeat(3000) })],
      }),
    );

    expect(identity.profile?.fields).toEqual([
      { name: 'n'.repeat(PROFILE_LIMITS.fieldName), value: 'v'.repeat(PROFILE_LIMITS.fieldValue) },
    ]);
  });

  it('url が 2048 字を超える絵文字を捨てる', async () => {
    const longUrl = new URL(`https://remote.example/${'a'.repeat(PROFILE_LIMITS.emojiUrl)}.png`);
    const identity = await identityOf(
      new Person({
        id,
        inbox,
        tags: [
          new Emoji({ name: ':long:', icon: new Image({ url: longUrl }) }),
          new Emoji({ name: ':blob:', icon: new Image({ url: new URL('https://remote.example/blob.png') }) }),
        ],
      }),
    );

    expect(identity.profile?.emojis).toEqual([{ shortcode: 'blob', url: 'https://remote.example/blob.png' }]);
  });

  it('shortcode に使えない文字や 1 文字の shortcode の絵文字を捨てる', async () => {
    const icon = new Image({ url: new URL('https://remote.example/e.png') });
    const identity = await identityOf(
      new Person({
        id,
        inbox,
        tags: [
          new Emoji({ name: ':bl<ob>:', icon }),
          new Emoji({ name: ':bl"ob:', icon }),
          new Emoji({ name: ':blob:cat:', icon }),
          new Emoji({ name: ':blob cat:', icon }),
          new Emoji({ name: ':a:', icon }),
          new Emoji({ name: ':blob_cat2:', icon }),
        ],
      }),
    );

    expect(identity.profile?.emojis).toEqual([{ shortcode: 'blob_cat2', url: 'https://remote.example/e.png' }]);
  });

  it('shortcode にハイフンとプラスを含む絵文字は残す', async () => {
    const icon = new Image({ url: new URL('https://remote.example/e.png') });
    const identity = await identityOf(
      new Person({
        id,
        inbox,
        tags: [new Emoji({ name: ':blobcat-heart:', icon }), new Emoji({ name: ':plus+one:', icon })],
      }),
    );

    expect(identity.profile?.emojis).toEqual([
      { shortcode: 'blobcat-heart', url: 'https://remote.example/e.png' },
      { shortcode: 'plus+one', url: 'https://remote.example/e.png' },
    ]);
  });

  it('getAttachments が失敗しても読めた分だけで identity を返し、fields は読まなかった扱いにする', async () => {
    const actor = new Person({ id, inbox, name: 'Alice' });
    vi.spyOn(actor, 'getAttachments').mockImplementation(() => {
      throw new Error('boom');
    });

    const identity = await identityOf(actor);

    expect(identity.profile?.displayName).toBe('Alice');
    expect(identity.profile?.fields).toBeUndefined();
    expect(identity.profile?.emojis).toEqual([]);
  });

  it('getTags と getImage が失敗しても identity を返す', async () => {
    const actor = new Person({ id, inbox, name: 'Alice' });
    vi.spyOn(actor, 'getTags').mockImplementation(() => {
      throw new Error('boom');
    });
    vi.spyOn(actor, 'getImage').mockRejectedValue(new Error('boom'));

    const identity = await identityOf(actor);

    expect(identity.uri).toBe(id.href);
    expect(identity.profile?.emojis).toBeUndefined();
    expect(identity.profile?.headerUri).toBeUndefined();
  });
});
