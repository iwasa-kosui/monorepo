import { describe, expect, it } from 'vitest';

import { avatarOf, liveUrlOf, nameOrRandom, randomName, reconnectDelayMs, sendsOnEnter, toneOf } from './live';
import { liveLimits, normalizeName } from './live-protocol';

describe('ランダムな名前', () => {
  it('乱数の値に応じて、様子と動物の組み合わせを返す', () => {
    expect(randomName(() => 0)).toBe('眠い柴犬');
    expect(randomName(() => 0.999)).toBe('散歩好きのメダカ');
  });

  it('どの組み合わせも、名前の上限の文字数に収まる', () => {
    const steps = 48;
    for (let mood = 0; mood < steps; mood += 1) {
      for (let animal = 0; animal < steps; animal += 1) {
        const values = [mood / steps, animal / steps];
        const name = randomName(() => values.shift() ?? 0);
        expect(normalizeName(name), name).toBe(name);
        expect([...name].length, name).toBeLessThanOrEqual(liveLimits.nameChars);
      }
    }
  });

  it('保存した名前があればそれを使い、無いか空ならランダムな名前を割り振る', () => {
    expect(nameOrRandom(' kosui の隣の席 ', () => 0)).toBe('kosui の隣の席');
    expect(nameOrRandom(null, () => 0)).toBe('眠い柴犬');
    expect(nameOrRandom('   ', () => 0)).toBe('眠い柴犬');
  });
});

describe('投稿の見た目', () => {
  it('アイコンには、名前の最初の1文字を使う', () => {
    expect(avatarOf('眠い柴犬')).toBe('眠');
    expect(avatarOf('🐶わん')).toBe('🐶');
    expect(avatarOf('')).toBe('?');
  });

  it('色は、author から決まり、同じ author なら同じ色になる', () => {
    expect(toneOf('abc123')).toBe(toneOf('abc123'));
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(toneOf)).size).toBeGreaterThan(1);
  });
});

describe('接続', () => {
  it('再接続までの時間は、失敗が続くほど延び、15 秒で止まる', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(reconnectDelayMs)).toEqual([1000, 2000, 4000, 8000, 15_000, 15_000, 15_000]);
  });

  it('https のページでは wss、http のページでは ws でつなぐ', () => {
    expect(liveUrlOf({ protocol: 'https:', host: 'example.com' }, '/api/hands-on', 'abc')).toBe(
      'wss://example.com/api/hands-on?sender=abc',
    );
    expect(liveUrlOf({ protocol: 'http:', host: '127.0.0.1:8799' }, '/api/hands-on', 'abc')).toBe(
      'ws://127.0.0.1:8799/api/hands-on?sender=abc',
    );
  });
});

describe('Enter で送る', () => {
  const enter = { key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 };

  it('マウスで操作する画面では、Enter で送る', () => {
    expect(sendsOnEnter(enter, true)).toBe(true);
  });

  it('Shift + Enter は改行なので、送らない', () => {
    expect(sendsOnEnter({ ...enter, shiftKey: true }, true)).toBe(false);
  });

  it('かな漢字変換を確定する Enter では、送らない', () => {
    expect(sendsOnEnter({ ...enter, isComposing: true }, true)).toBe(false);
    expect(sendsOnEnter({ ...enter, keyCode: 229 }, true)).toBe(false);
  });

  it('指で操作する画面では、Enter は改行なので、送らない', () => {
    expect(sendsOnEnter(enter, false)).toBe(false);
  });
});
