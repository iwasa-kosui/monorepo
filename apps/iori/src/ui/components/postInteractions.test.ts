import { describe, expect, it } from 'vitest';

import type { IoriInteractionAccount } from '../../adaptor/routes/workerIoriActionsRouter.ts';
import { interactionAccountLink } from './postInteractions.ts';

const account = (overrides: Partial<IoriInteractionAccount>): IoriInteractionAccount => ({
  id: null,
  local: false,
  display_name: 'Alice',
  acct: 'alice@remote.example',
  avatar: null,
  url: null,
  ...overrides,
});

describe('interactionAccountLink', () => {
  it('ローカルの人は、このサーバーのプロフィールに繋ぐ', () => {
    expect(interactionAccountLink(account({ id: 'actor-1', local: true, acct: 'kosui' }))).toEqual({
      href: '/users/kosui',
      external: false,
    });
  });

  it('手元に保存済みのリモートの人は、このサーバー上のプロフィールに繋ぐ', () => {
    expect(interactionAccountLink(account({ id: 'actor-2', url: 'https://remote.example/@alice' }))).toEqual({
      href: '/remote-users/actor-2',
      external: false,
    });
  });

  it('相手のサーバーから読んだだけの人は、相手のサーバーのプロフィールを別タブで開く', () => {
    expect(interactionAccountLink(account({ url: 'https://remote.example/@alice' }))).toEqual({
      href: 'https://remote.example/@alice',
      external: true,
    });
  });

  it('http(s) でない URL にはリンクしない', () => {
    expect(interactionAccountLink(account({ url: 'javascript:alert(1)' }))).toBeUndefined();
    expect(interactionAccountLink(account({ url: null }))).toBeUndefined();
  });
});
