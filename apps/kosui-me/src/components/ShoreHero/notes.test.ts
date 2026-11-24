import { describe, expect, it } from 'vitest';

import { goneNote, recordLoss } from './notes';

const memoryStorage = (initial?: string) => {
  let value: string | null = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
};

describe('recordLoss', () => {
  it('最初の 1 匹は 1 を返す', () => {
    expect(recordLoss(memoryStorage())).toBe(1);
  });

  it('攫われるたびに 1 ずつ増える', () => {
    const storage = memoryStorage();
    recordLoss(storage);
    recordLoss(storage);
    expect(recordLoss(storage)).toBe(3);
  });

  it('保存されていた値が数でなければ、1 から数え直す', () => {
    expect(recordLoss(memoryStorage('たくさん'))).toBe(1);
    expect(recordLoss(memoryStorage('-4'))).toBe(1);
  });

  it('保存できない環境では undefined を返す', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
    };
    expect(recordLoss(blocked)).toBeUndefined();
  });
});

describe('goneNote', () => {
  it('何匹目かを添える', () => {
    expect(goneNote(3)).toBe(
      'エビは波に攫われました。このブラウザでは3匹目です。再読み込みすると、次のエビが打ち上げられます。',
    );
  });

  it('数えられなかったときは、数に触れない', () => {
    expect(goneNote(undefined)).toBe(
      'エビは波に攫われました。再読み込みすると、次のエビが打ち上げられます。',
    );
  });
});
