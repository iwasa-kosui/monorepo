import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadChoice, saveChoice } from './storage';

const memoryStorage = (): Storage => {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('選んだ案の保存', () => {
  it('保存した案の識別子を、同じ ID で読み出せる', () => {
    const local = memoryStorage();
    vi.stubGlobal('window', { localStorage: local });
    expect(loadChoice('adr-1')).toBeNull();
    expect(saveChoice('adr-1', 'write-to-log')).toBe(true);
    expect(loadChoice('adr-1')).toBe('write-to-log');
    expect(local.getItem('es:choice:adr-1')).toBe('write-to-log');
    expect(loadChoice('adr-2')).toBeNull();
  });

  it('ローカルストレージが使えないときは、保存に失敗し、何も読み出さない', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('blocked');
      },
    });
    expect(saveChoice('adr-1', 'write-to-log')).toBe(false);
    expect(loadChoice('adr-1')).toBeNull();
  });

  it('書き込みが例外になるときは、保存に失敗する', () => {
    const local = memoryStorage();
    local.setItem = () => {
      throw new Error('quota');
    };
    vi.stubGlobal('window', { localStorage: local });
    expect(saveChoice('adr-1', 'write-to-log')).toBe(false);
  });
});
