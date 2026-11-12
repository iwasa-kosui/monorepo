import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import {
  canSendEdit,
  editErrorMessage,
  editLoadErrorMessage,
  hasEditableImages,
  initialEditValue,
} from './editDialog.ts';

const apiError = (status: number): Error => Object.assign(new Error('x'), { status });

const status = (overrides: Partial<Status> = {}): Status =>
  ({ id: 'post-1', sensitive: false, media_attachments: [], ...overrides }) as unknown as Status;

describe('initialEditValue', () => {
  it('本文と CW を /source から、センシティブを Status から入れる', () => {
    expect(initialEditValue({ id: 'post-1', text: '元の本文', spoiler_text: '元の CW' }, status({ sensitive: true })))
      .toEqual({ content: '元の本文', cw: '元の CW', sensitive: true });
  });

  it('センシティブでない投稿は false から始める', () => {
    expect(initialEditValue({ id: 'post-1', text: 'a', spoiler_text: '' }, status({ sensitive: false })).sensitive)
      .toBe(false);
  });
});

describe('hasEditableImages', () => {
  it('画像の添付があるかを返す', () => {
    expect(hasEditableImages(status())).toBe(false);
    expect(hasEditableImages(status({ media_attachments: [{ id: 'm1' }] as unknown as Status['media_attachments'] })))
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

describe('editLoadErrorMessage', () => {
  it('404 は投稿が見つからないと伝える', () => {
    expect(editLoadErrorMessage(apiError(404))).toBe('編集する投稿が見つかりません');
  });

  it('それ以外は読み込めなかったと伝える', () => {
    expect(editLoadErrorMessage(apiError(500))).toBe('編集する内容を読み込めませんでした');
    expect(editLoadErrorMessage(new TypeError('Failed to fetch'))).toBe('編集する内容を読み込めませんでした');
  });
});

describe('editErrorMessage', () => {
  it('404 は投稿が見つからないと伝える', () => {
    expect(editErrorMessage(apiError(404))).toBe('編集する投稿が見つかりません');
  });

  it('422 は本文と文字数を確認するよう伝える', () => {
    expect(editErrorMessage(apiError(422))).toBe(
      '投稿を更新できません。本文が空でないか、文字数が上限を超えていないか確認してください',
    );
  });

  it('それ以外の API エラーとネットワークエラーは編集できなかったと伝える', () => {
    expect(editErrorMessage(apiError(500))).toBe('編集できませんでした');
    expect(editErrorMessage(new TypeError('Failed to fetch'))).toBe('編集できませんでした');
  });
});
