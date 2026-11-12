import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import { BlueskyChatComposer } from './BlueskyChatComposer.tsx';

const render = (props: Partial<Parameters<typeof BlueskyChatComposer>[0]> = {}): string =>
  String(jsx(BlueskyChatComposer, {
    text: 'hello',
    isSending: false,
    canSend: true,
    error: null,
    onChange: () => {},
    onSend: () => {},
    ...props,
  }));

describe('BlueskyChatComposer', () => {
  it('既定では Bluesky の上限までの残り文字数を出し、注意書きは出さない', () => {
    const html = render();

    expect(html).toContain('data-testid="bluesky-chat-remaining"');
    expect(html).toContain('>995<');
    expect(html).not.toContain('chat-composer-notice');
  });

  it('残り文字数、testid、注意書きを差し替えられる', () => {
    const html = render({
      remaining: 9995,
      testId: 'fediverse-chat-remaining',
      notice: '相手のサーバーにも保存されます',
    });

    expect(html).toContain('data-testid="fediverse-chat-remaining"');
    expect(html).toContain('>9995<');
    expect(html).toContain('data-testid="chat-composer-notice"');
    expect(html).toContain('相手のサーバーにも保存されます');
  });

  it('上限を超えたら残り文字数を赤にし、送れないときは送信ボタンを無効にする', () => {
    const html = render({ remaining: -1, canSend: false });

    expect(html).toContain('text-red-600');
    expect(html).toContain('disabled');
  });
});
