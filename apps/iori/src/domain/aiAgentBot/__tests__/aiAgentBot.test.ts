import { describe, expect, it } from 'vitest';

import { AiAgentBot } from '../aiAgentBot.ts';

// GitHub のユーザー名: 英数字と（連続しない・先頭末尾でない）ハイフン、最大 39 文字
const GITHUB_USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

describe('AiAgentBot.username', () => {
  it('is not a valid GitHub username, so writing the handle on GitHub never notifies anyone', () => {
    expect(GITHUB_USERNAME.test(AiAgentBot.username)).toBe(false);
  });

  it('is a valid Fediverse username', () => {
    expect(AiAgentBot.username).toMatch(/^[A-Za-z0-9_]+$/);
  });
});
