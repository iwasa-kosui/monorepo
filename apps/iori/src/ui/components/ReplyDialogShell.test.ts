import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import { ReplyDialogShell } from './ReplyDialogShell.tsx';

const render = (props: Partial<Parameters<typeof ReplyDialogShell>[0]> = {}): string =>
  String(jsx(ReplyDialogShell, {
    onClose: () => {},
    onSubmit: () => {},
    isSending: false,
    canSubmit: true,
    children: jsx('textarea', {}),
    ...props,
  }));

describe('ReplyDialogShell', () => {
  it('キャンセルと返信するのボタンを出す', () => {
    const html = render();

    expect(html).toContain('キャンセル');
    expect(html).toContain('返信する');
  });

  it('title と submitLabel を渡さないときは、見出しを「返信」、送信のボタンを「返信する」にする', () => {
    const html = render();

    expect(html).toContain('>返信</h2>');
    expect(html).toContain('>返信する</button>');
  });

  it('title と submitLabel を渡すと、見出しと送信のボタンをその文言にする', () => {
    const html = render({ title: '引用', submitLabel: '引用して投稿' });

    expect(html).toContain('>引用</h2>');
    expect(html).toContain('>引用して投稿</button>');
    expect(html).not.toContain('返信する');
  });

  it('送信中は submitLabel によらず「送信中...」を出す', () => {
    expect(render({ isSending: true, submitLabel: '引用して投稿' })).toContain('>送信中...</button>');
  });

  it('leadingActions を渡すと、ボタン列の先頭でキャンセルのボタンより前に出す', () => {
    const html = render({ leadingActions: jsx('select', { name: 'reply-destination' }) });

    expect(html).toContain('name="reply-destination"');
    expect(html.indexOf('name="reply-destination"')).toBeLessThan(html.indexOf('キャンセル'));
  });

  it('leadingActions と counter を両方渡すと、leadingActions を counter より前に出す', () => {
    const html = render({
      leadingActions: jsx('select', { name: 'reply-destination' }),
      counter: jsx('span', {}, 'counter-text'),
    });

    expect(html.indexOf('name="reply-destination"')).toBeLessThan(html.indexOf('counter-text'));
  });

  it('leadingActions を渡さないときは、送り先の選択を出さない', () => {
    const html = render();

    expect(html).not.toContain('<select');
    expect(html).toContain('<div class="mt-3 flex gap-2 justify-end"><button');
  });
});
