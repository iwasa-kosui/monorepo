import { describe, expect, it } from 'vitest';

import { canConfirm, chosenDetail, outcomeOf, restoredChoice, titleOf } from './choice';

const options = ['append-in-update', 'write-to-log', 'db-feature'];

describe('outcomeOf', () => {
  it('採用案と同じ案を選ぶと adopted、別の案を選ぶと other を返す', () => {
    expect(outcomeOf('append-in-update', 'append-in-update')).toBe('adopted');
    expect(outcomeOf('write-to-log', 'append-in-update')).toBe('other');
  });
});

describe('chosenDetail', () => {
  it('合図のキーに一致の結果を、データに選んだ案の識別子を入れる', () => {
    expect(chosenDetail('append-in-update', 'append-in-update')).toEqual({
      key: 'adopted',
      option: 'append-in-update',
    });
    expect(chosenDetail('db-feature', 'append-in-update')).toEqual({ key: 'other', option: 'db-feature' });
  });
});

describe('restoredChoice', () => {
  it('保存された案が案の一覧にあれば、その案を復元する', () => {
    expect(restoredChoice('write-to-log', options)).toBe('write-to-log');
  });

  it('何も保存されていないとき、または一覧に無い値のときは、復元しない', () => {
    expect(restoredChoice(null, options)).toBeNull();
    expect(restoredChoice('', options)).toBeNull();
    expect(restoredChoice('removed-option', options)).toBeNull();
  });
});

describe('titleOf', () => {
  const choice = { id: 'adr-1', pendingTitle: '選ぶ前の表題' };

  it('案を選ぶ設定が無いか、選び終えたあとは、本来の表題を返す', () => {
    expect(titleOf('本来の表題', undefined, false)).toBe('本来の表題');
    expect(titleOf('本来の表題', choice, true)).toBe('本来の表題');
  });

  it('案を選ぶ前は、決定の内容を含まない表題を返す', () => {
    expect(titleOf('本来の表題', choice, false)).toBe('選ぶ前の表題');
  });
});

describe('canConfirm', () => {
  it('案を選んでいて、まだ確定していないときだけ、確定できる', () => {
    expect(canConfirm('write-to-log', null)).toBe(true);
    expect(canConfirm(null, null)).toBe(false);
    expect(canConfirm('write-to-log', 'append-in-update')).toBe(false);
    expect(canConfirm(null, 'append-in-update')).toBe(false);
  });
});
