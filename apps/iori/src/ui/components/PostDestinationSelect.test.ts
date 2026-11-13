import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import { PostDestinationSelect } from './PostDestinationSelect.tsx';

const render = (props: Partial<Parameters<typeof PostDestinationSelect>[0]> = {}): string =>
  String(jsx(PostDestinationSelect, { value: 'both', onChange: () => {}, name: 'destination', ...props }));

describe('PostDestinationSelect', () => {
  it('既定では両方と Fediverse だけの 2 つを出す', () => {
    const html = render();

    expect(html).toContain('value="both"');
    expect(html).toContain('value="fediverse"');
    expect(html).not.toContain('value="bluesky"');
    expect(html).not.toContain('Bluesky だけ');
  });

  it('allowBlueskyOnly のときだけ Bluesky だけを 3 つ目に出す', () => {
    const html = render({ allowBlueskyOnly: true });

    expect(html).toContain('value="bluesky"');
    expect(html).toContain('Bluesky だけ');
    expect(html.indexOf('value="fediverse"')).toBeLessThan(html.indexOf('value="bluesky"'));
  });

  it('value が bluesky のとき、Bluesky だけを選択済みにする', () => {
    const html = render({ allowBlueskyOnly: true, value: 'bluesky' });

    expect(html).toMatch(/value="bluesky"[^>]*checked|checked[^>]*value="bluesky"/);
    expect(html).not.toMatch(/value="both"[^>]*checked|checked[^>]*value="both"/);
  });

  it('disabled のとき、すべての選択肢を無効にする', () => {
    const html = render({ allowBlueskyOnly: true, disabled: true });

    expect(html.match(/<input[^>]*disabled=""/g)).toHaveLength(3);
  });

  it('disabled を渡さなければ、選択肢を無効にしない', () => {
    expect(render()).not.toContain('disabled');
  });
});
