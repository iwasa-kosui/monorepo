import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { canSendEdit, editErrorMessage, initialEditValue } from './editDialog.ts';

const apiError = (status: number, message = 'x'): Error => Object.assign(new Error(message), { status });

const status = (overrides: Partial<Status> = {}): Status =>
  ({ id: 'post-1', sensitive: false, media_attachments: [], ...overrides }) as unknown as Status;

describe('initialEditValue', () => {
  it('本文と CW を /source から入れる', () => {
    expect(initialEditValue({ id: 'post-1', text: '元の本文', spoiler_text: '元の CW' }, status({ sensitive: true })))
      .toEqual({ content: '元の本文', cw: '元の CW', sensitive: false });
  });

  it('センシティブでない投稿は false から始める', () => {
    expect(initialEditValue({ id: 'post-1', text: 'a', spoiler_text: '' }, status({ sensitive: false })).sensitive)
      .toBe(false);
  });

  it('CW があるときは、Status がセンシティブでも false から始める', () => {
    expect(initialEditValue({ id: 'post-1', text: 'a', spoiler_text: '注意' }, status({ sensitive: true })).sensitive)
      .toBe(false);
  });

  it('CW が無いときは Status のセンシティブを引き継ぐ', () => {
    expect(initialEditValue({ id: 'post-1', text: 'a', spoiler_text: '' }, status({ sensitive: true })).sensitive)
      .toBe(true);
  });
});

describe('canSendEdit', () => {
  it('読み込み済みで、送信中でなく、本文があれば送れる', () => {
    expect(canSendEdit('本文', false, 'loaded', false)).toBe(true);
  });

  it('読み込み中と読み込みに失敗したときは送れない', () => {
    expect(canSendEdit('本文', false, 'loading', false)).toBe(false);
    expect(canSendEdit('本文', false, 'failed', false)).toBe(false);
  });

  it('送信中は送れない', () => {
    expect(canSendEdit('本文', false, 'loaded', true)).toBe(false);
  });

  it('本文が空白だけで画像も無ければ送れない', () => {
    expect(canSendEdit(' \n', false, 'loaded', false)).toBe(false);
  });

  it('画像があれば本文が空でも送れる', () => {
    expect(canSendEdit('', true, 'loaded', false)).toBe(true);
  });
});

describe('editErrorMessage', () => {
  it('422 は本文と文字数を確認するよう伝える', () => {
    expect(editErrorMessage(apiError(422))).toBe(
      '投稿を更新できません。本文が空でないか、文字数が上限を超えていないか確認してください',
    );
  });

  it('422 の本文が宛先の追加を断るものなら、ダイレクトの投稿には宛先を足せないと伝える', () => {
    expect(
      editErrorMessage(apiError(422, 'Validation failed: Direct statuses can\'t add new recipients when edited')),
    ).toBe('ダイレクトの投稿には宛先を足せません');
  });
});
