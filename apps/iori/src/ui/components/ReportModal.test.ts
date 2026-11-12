import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import { ReportModal } from './ReportModal.tsx';

const render = (props: Partial<Parameters<typeof ReportModal>[0]> = {}): string =>
  String(
    jsx(ReportModal, {
      targetLabel: '@alice.bsky.social',
      isOpen: true,
      isSubmitting: false,
      onSubmit: () => undefined,
      onClose: () => undefined,
      ...props,
    }),
  );

const submitButton = (html: string): string => /<button[^>]*>\s*通報する\s*<\/button>/.exec(html)?.[0] ?? '';

describe('ReportModal', () => {
  it('閉じているときは何も描画しない', () => {
    expect(render({ isOpen: false })).toBe('');
  });

  it('見出しに「{targetLabel} を通報」を出す', () => {
    expect(render({ targetLabel: '@alice.bsky.social' })).toContain('@alice.bsky.social を通報</h2>');
  });

  it('理由を 3 つのラジオボタンで出し、どれも選択済みにしない', () => {
    const html = render();

    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain('スパム');
    expect(html).toContain('不快・攻撃的な内容');
    expect(html).toContain('その他');
    expect(html).toContain('value="spam"');
    expect(html).toContain('value="offensive"');
    expect(html).toContain('value="other"');
    expect(html).not.toContain('checked');
  });

  it('理由を選ぶまで「通報する」を無効にする', () => {
    expect(submitButton(render())).toContain('disabled');
  });

  it('送信中は「通報する」とキャンセルを無効にする', () => {
    const html = render({ isSubmitting: true });

    expect(submitButton(html)).toContain('disabled');
    expect(/<button[^>]*>\s*キャンセル\s*<\/button>/.exec(html)?.[0]).toContain('disabled');
  });

  it('任意のコメント欄と、キャンセルと通報するのボタンを出す', () => {
    const html = render();

    expect(html).toContain('コメント（任意）');
    expect(html).toContain('<textarea');
    expect(html).toContain('キャンセル');
    expect(submitButton(html)).not.toBe('');
  });

  it('error があれば role が alert の要素に出し、無ければ出さない', () => {
    expect(render({ error: '通報に失敗しました' })).toContain('role="alert"');
    expect(render({ error: '通報に失敗しました' })).toContain('通報に失敗しました');
    expect(render()).not.toContain('role="alert"');
  });
});
