import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import { ReportModal } from './ReportModal.tsx';

const render = (props: Partial<Parameters<typeof ReportModal>[0]> = {}): string =>
  String(jsx(ReportModal, {
    targetLabel: '@alice@remote.example',
    isOpen: true,
    isSubmitting: false,
    onSubmit: () => {},
    onClose: () => {},
    ...props,
  }));

const submitButtonTag = (html: string): string => /<button[^>]*>\s*通報する\s*<\/button>/.exec(html)?.[0] ?? '';

describe('ReportModal', () => {
  it('閉じているときは何も出さない', () => {
    expect(render({ isOpen: false })).toBe('');
  });

  it('見出しに対象を出し、理由の 3 つのラジオとキャンセルと通報するを出す', () => {
    const html = render();

    expect(html).toContain('@alice@remote.example を通報');
    expect(html).toContain('スパム');
    expect(html).toContain('不快・攻撃的な内容');
    expect(html).toContain('その他');
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain('キャンセル');
    expect(html).toContain('通報する');
  });

  it('理由は初期で未選択にして、選ぶまで通報するを無効にする', () => {
    const html = render();

    expect(html).not.toMatch(/<input[^>]*checked/);
    expect(submitButtonTag(html)).toContain('disabled');
  });

  it('コメントは 1000 文字までの textarea にする', () => {
    expect(render()).toMatch(/<textarea[^>]*maxlength="1000"/);
  });

  it('error を渡すとモーダルに出し、渡さなければ出さない', () => {
    expect(render({ error: 'Failed to report: HTTP 422' })).toContain('Failed to report: HTTP 422');
    expect(render()).not.toContain('role="alert"');
  });

  it('送信中は通報するを無効にして、キャンセルも無効にする', () => {
    const html = render({ isSubmitting: true });

    expect(submitButtonTag(html)).toContain('disabled');
    expect(/<button[^>]*>\s*キャンセル\s*<\/button>/.exec(html)?.[0]).toContain('disabled');
  });
});
