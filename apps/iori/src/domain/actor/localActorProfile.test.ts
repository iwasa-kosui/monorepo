import { describe, expect, it } from 'vitest';

import { Username } from '../../domain/user/username.ts';
import type { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { ActorId } from './actorId.ts';
import type { LocalActor } from './localActor.ts';
import {
  LOCAL_ACTOR_BIO_MAX_LENGTH,
  LOCAL_ACTOR_DISPLAY_NAME_MAX_LENGTH,
  LocalActorProfile,
} from './localActorProfile.ts';
import { updateLocalActorProfile } from './updateLocalActorProfile.ts';

const actor: LocalActor = {
  id: ActorId.generate(),
  userId: UserId.generate(),
  type: 'local',
  username: Username.orThrow('kosui'),
  uri: 'https://iori.example/users/kosui',
  inboxUrl: 'https://iori.example/users/kosui/inbox',
  displayName: '岩佐',
  bio: '自己紹介',
};
const now = 1_700_000_000_000 as Instant;

describe('LocalActorProfile.validate', () => {
  it('送られた項目だけを patch にし、空文字は null にする', () => {
    expect(LocalActorProfile.validate({})).toEqual({ ok: true, val: {} });
    expect(LocalActorProfile.validate({ displayName: '', bio: '本文' })).toEqual({
      ok: true,
      val: { displayName: null, bio: '本文' },
    });
  });

  it('自己紹介の改行を LF にそろえる', () => {
    expect(LocalActorProfile.validate({ bio: 'a\r\nb\rc' })).toEqual({ ok: true, val: { bio: 'a\nb\nc' } });
  });

  it('表示名の改行とその他の制御文字を半角空白に置き換え、長さは置き換えたあとの文字列で数える', () => {
    expect(LocalActorProfile.validate({ displayName: 'a\r\nb\rc\nd\te\u0000f' })).toEqual({
      ok: true,
      val: { displayName: 'a  b c d e f' },
    });
    expect(LocalActorProfile.validate({ displayName: '\n' })).toEqual({ ok: true, val: { displayName: ' ' } });
  });

  it('自己紹介の改行は許し、制御文字の置き換えは表示名だけに行う', () => {
    expect(LocalActorProfile.validate({ displayName: 'a\nb', bio: 'a\nb\tc' })).toEqual({
      ok: true,
      val: { displayName: 'a b', bio: 'a\nb\tc' },
    });
  });

  it('文字数は上限ちょうどまで通し、サロゲートペアも 1 文字と数える', () => {
    expect(LocalActorProfile.validate({ displayName: '😀'.repeat(LOCAL_ACTOR_DISPLAY_NAME_MAX_LENGTH) }).ok).toBe(true);
    expect(LocalActorProfile.validate({ bio: 'あ'.repeat(LOCAL_ACTOR_BIO_MAX_LENGTH) }).ok).toBe(true);
  });

  it('上限を超えたらどの項目かを添えて失敗する', () => {
    const name = LocalActorProfile.validate({ displayName: 'あ'.repeat(LOCAL_ACTOR_DISPLAY_NAME_MAX_LENGTH + 1) });
    const bio = LocalActorProfile.validate({ bio: 'あ'.repeat(LOCAL_ACTOR_BIO_MAX_LENGTH + 1) });

    expect(name).toMatchObject({
      ok: false,
      err: { type: 'InvalidLocalActorProfileError', detail: { field: 'displayName' } },
    });
    expect(bio).toMatchObject({ ok: false, err: { type: 'InvalidLocalActorProfileError', detail: { field: 'bio' } } });
  });
});

describe('updateLocalActorProfile', () => {
  it('patch に含まれない項目は変えず、null の項目は未設定にして、actor.localProfileUpdated を作る', () => {
    const event = updateLocalActorProfile(now)(actor, { bio: null });

    expect(event).toMatchObject({
      eventName: 'actor.localProfileUpdated',
      aggregateId: actor.id,
      eventPayload: { actorId: actor.id, displayName: '岩佐', bio: undefined },
    });
    expect(event.aggregateState).toEqual({ ...actor, displayName: '岩佐', bio: undefined });
  });
});
