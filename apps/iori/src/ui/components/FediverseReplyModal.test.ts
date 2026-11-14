import { describe, expect, it } from 'vitest';

import { shouldCloseReplyModalOnKey } from './FediverseReplyModal.tsx';

describe('shouldCloseReplyModalOnKey', () => {
  it('Escape で、送信中でなければ閉じる', () => {
    expect(shouldCloseReplyModalOnKey('Escape', false)).toBe(true);
  });

  it('Escape でも、送信中は閉じない', () => {
    expect(shouldCloseReplyModalOnKey('Escape', true)).toBe(false);
  });

  it('Escape 以外のキーでは閉じない', () => {
    expect(shouldCloseReplyModalOnKey('Enter', false)).toBe(false);
  });
});
