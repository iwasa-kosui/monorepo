import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import { PostDestinationSelect } from './PostDestinationSelect.tsx';

const render = (props: Partial<Parameters<typeof PostDestinationSelect>[0]> = {}): string =>
  String(jsx(PostDestinationSelect, { value: 'both', onChange: () => {}, name: 'destination', ...props }));

describe('PostDestinationSelect', () => {
  it('既定では両方と Fediverse のみの 2 つを出す', () => {
    const html = render();

    expect(html).toContain('value="both"');
    expect(html).toContain('value="fediverse"');
    expect(html).not.toContain('value="bluesky"');
    expect(html).not.toContain('Bluesky のみ');
  });

  it('allowBlueskyOnly のときだけ Bluesky のみを 3 つ目に出す', () => {
    const html = render({ allowBlueskyOnly: true });

    expect(html).toContain('value="bluesky"');
    expect(html).toContain('Bluesky のみ');
    expect(html.indexOf('value="fediverse"')).toBeLessThan(html.indexOf('value="bluesky"'));
  });

  it('value が bluesky のとき、Bluesky のみを選択済みにする', () => {
    const html = render({ allowBlueskyOnly: true, value: 'bluesky' });

    expect(html).toMatch(/<option value="bluesky" selected="">/);
    expect(html).not.toMatch(/<option value="both" selected="">/);
  });

  it('送り先のセレクトを aria-label 付きで出す', () => {
    expect(render()).toMatch(/<select name="destination" aria-label="送り先"/);
  });

  it('disabled のとき、セレクトを無効にする', () => {
    const html = render({ allowBlueskyOnly: true, disabled: true });

    expect(html).toMatch(/<select[^>]*disabled=""/);
  });

  it('disabled を渡さなければ、選択肢を無効にしない', () => {
    expect(render()).not.toContain('disabled');
  });
});
