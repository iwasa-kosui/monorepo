import { describe, expect, it } from 'vitest';

import { ControlCommand } from '../src/domain/control-command.ts';
import { UserId } from '../src/domain/user-id.ts';

const userId = UserId.schema.parse('U0BOT123');

describe('ControlCommand.parse', () => {
  it('text が undefined なら NotForUs', () => {
    expect(ControlCommand.parse(undefined, userId).kind).toBe('NotForUs');
  });

  it('メンションがなければ NotForUs', () => {
    expect(ControlCommand.parse('hello on', userId).kind).toBe('NotForUs');
  });

  it('別ユーザーへのメンションは NotForUs', () => {
    expect(ControlCommand.parse('<@U99OTHER> on', userId).kind).toBe('NotForUs');
  });

  it('「on」で On を返す', () => {
    expect(ControlCommand.parse(`<@${userId}> on`, userId).kind).toBe('On');
  });

  it('「オン」で On を返す', () => {
    expect(ControlCommand.parse(`<@${userId}> オン`, userId).kind).toBe('On');
  });

  it('大文字 ON も On として扱う', () => {
    expect(ControlCommand.parse(`<@${userId}> ON`, userId).kind).toBe('On');
  });

  it('「off」で Off を返す', () => {
    expect(ControlCommand.parse(`<@${userId}> off`, userId).kind).toBe('Off');
  });

  it('「オフ」で Off を返す', () => {
    expect(ControlCommand.parse(`<@${userId}> オフ`, userId).kind).toBe('Off');
  });

  it('メンション形式 <@U..|alias> も認識する', () => {
    expect(ControlCommand.parse(`<@${userId}|thread-expander> off`, userId).kind).toBe('Off');
  });

  it('既知でないコマンドは Unknown', () => {
    const cmd = ControlCommand.parse(`<@${userId}> please stop`, userId);
    expect(cmd.kind).toBe('Unknown');
    if (cmd.kind === 'Unknown') {
      expect(cmd.rest).toBe('please stop');
    }
  });

  it('前後のメンション位置に依存しない', () => {
    expect(ControlCommand.parse(`hey <@${userId}> off please?`, userId).kind).toBe('Unknown');
    expect(ControlCommand.parse(`<@${userId}>  off  `, userId).kind).toBe('Off');
  });
});
