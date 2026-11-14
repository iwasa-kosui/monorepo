import { describe, expect, it } from 'vitest';

import { Scope } from '../scope.ts';

const scopes = (...values: string[]) => values.map((value) => Scope.orThrow(value));

describe('Scope', () => {
  describe('parseList', () => {
    it('省略時は read だけを返す', () => {
      for (const input of [undefined, null, '', '   ']) {
        const result = Scope.parseList(input);
        expect(result).toMatchObject({ ok: true, val: ['read'] });
      }
    });

    it('スペース区切りを解釈し、重複を除く', () => {
      const result = Scope.parseList('read  write read:accounts write');
      expect(result).toMatchObject({ ok: true, val: ['read', 'write', 'read:accounts'] });
    });

    it('未知のスコープはエラーにする', () => {
      const result = Scope.parseList('read admin:read');
      expect(result).toMatchObject({ ok: false, err: { type: 'InvalidScopeError', detail: { scope: 'admin:read' } } });
    });
  });

  describe('includes', () => {
    it('read は read:* を含み、write:* を含まない', () => {
      expect(Scope.includes(scopes('read'), Scope.orThrow('read:statuses'))).toBe(true);
      expect(Scope.includes(scopes('read'), Scope.orThrow('write:statuses'))).toBe(false);
    });

    it('write は write:* を含み、read:* を含まない', () => {
      expect(Scope.includes(scopes('write'), Scope.orThrow('write:media'))).toBe(true);
      expect(Scope.includes(scopes('write'), Scope.orThrow('read:accounts'))).toBe(false);
    });

    it('follow は read:follows、write:follows、write:blocks、write:mutes だけを含む', () => {
      const granted = scopes('follow');
      for (const included of ['read:follows', 'write:follows', 'write:blocks', 'write:mutes']) {
        expect(Scope.includes(granted, Scope.orThrow(included))).toBe(true);
      }
      expect(Scope.includes(granted, Scope.orThrow('read:blocks'))).toBe(false);
      expect(Scope.includes(granted, Scope.orThrow('write:statuses'))).toBe(false);
    });

    it('細分スコープは親のスコープを含まない', () => {
      expect(Scope.includes(scopes('read:accounts'), Scope.orThrow('read'))).toBe(false);
    });

    it('profile は verify_credentials 用で、read:accounts とは別に扱う', () => {
      const required = scopes('read:accounts', 'profile');
      expect(Scope.includesAny(scopes('profile'), required)).toBe(true);
      expect(Scope.includesAny(scopes('read'), required)).toBe(true);
      expect(Scope.includesAny(scopes('write'), required)).toBe(false);
    });
  });

  describe('isSubset', () => {
    it('登録スコープに含まれる要求スコープを許す', () => {
      expect(Scope.isSubset(scopes('read:statuses', 'write:media'), scopes('read', 'write'))).toBe(true);
      expect(Scope.isSubset(scopes('read', 'write'), scopes('read', 'write', 'follow'))).toBe(true);
    });

    it('登録スコープより広い要求を拒む', () => {
      expect(Scope.isSubset(scopes('read', 'write'), scopes('read'))).toBe(false);
      expect(Scope.isSubset(scopes('read'), scopes('read:statuses'))).toBe(false);
      expect(Scope.isSubset(scopes('push'), scopes('read', 'write', 'follow'))).toBe(false);
    });
  });
});
