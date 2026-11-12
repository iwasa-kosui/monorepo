import { describe, expect, it } from 'vitest';

import {
  blueskySearchErrorMessage,
  parseSearchSource,
  shouldRerunIoriSearch,
  withSearchSource,
} from './searchSource.ts';

describe('parseSearchSource', () => {
  it('クエリが無いときは iori の検索にする', () => {
    expect(parseSearchSource('')).toBe('iori');
  });

  it('source の値に対応するタブを返す', () => {
    expect(parseSearchSource('?source=bluesky-posts')).toBe('bluesky-posts');
    expect(parseSearchSource('?source=bluesky-actors')).toBe('bluesky-actors');
  });

  it('知らない値は iori の検索にする', () => {
    expect(parseSearchSource('?source=other')).toBe('iori');
    expect(parseSearchSource('?source=')).toBe('iori');
  });
});

describe('withSearchSource', () => {
  it('iori の検索ではクエリを付けない', () => {
    expect(withSearchSource('?source=bluesky-posts', 'iori')).toBe('');
  });

  it('Bluesky のタブでは source を付ける', () => {
    expect(withSearchSource('', 'bluesky-actors')).toBe('?source=bluesky-actors');
    expect(withSearchSource('?source=bluesky-actors', 'bluesky-posts')).toBe('?source=bluesky-posts');
  });

  it('source 以外のクエリは残す', () => {
    expect(withSearchSource('?a=1', 'bluesky-posts')).toBe('?a=1&source=bluesky-posts');
    expect(withSearchSource('?a=1&source=bluesky-posts', 'iori')).toBe('?a=1');
  });

  it('付けた結果を parseSearchSource で読み戻せる', () => {
    expect(parseSearchSource(withSearchSource('', 'bluesky-actors'))).toBe('bluesky-actors');
  });
});

describe('blueskySearchErrorMessage', () => {
  it.each([
    [400, undefined, '検索語は300文字までです'],
    [403, undefined, 'この検索はオーナーだけが使えます'],
    [409, undefined, 'Bluesky のタイムラインが無効です'],
    [429, undefined, 'Bluesky の検索の上限に達しました。しばらく待ってからもう一度お試しください'],
    [502, 'auth', 'Bluesky にログインできませんでした'],
    [502, 'unavailable', 'Bluesky を検索できませんでした'],
    [502, undefined, 'Bluesky を検索できませんでした'],
    [500, undefined, 'Bluesky を検索できませんでした'],
    [undefined, undefined, 'Bluesky を検索できませんでした'],
  ])('status %s と code %s の文言を決める', (status, code, expected) => {
    expect(blueskySearchErrorMessage(status, code)).toBe(expected);
  });

  it('502 以外では code が auth でも status の文言にする', () => {
    expect(blueskySearchErrorMessage(429, 'auth')).toBe(
      'Bluesky の検索の上限に達しました。しばらく待ってからもう一度お試しください',
    );
  });
});

describe('shouldRerunIoriSearch', () => {
  it('最後に検索した語と違う語が送信されていたらやり直す', () => {
    expect(shouldRerunIoriSearch('bar', 'foo')).toBe(true);
    expect(shouldRerunIoriSearch('bar', undefined)).toBe(true);
  });

  it('同じ語なら何もしない', () => {
    expect(shouldRerunIoriSearch('foo', 'foo')).toBe(false);
  });

  it('送信された語が空なら何もしない', () => {
    expect(shouldRerunIoriSearch('', 'foo')).toBe(false);
    expect(shouldRerunIoriSearch('', undefined)).toBe(false);
  });
});
