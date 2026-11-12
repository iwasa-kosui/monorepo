import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { PostVisibility } from './postVisibility.ts';
import { PostVisibilitySelect } from './PostVisibilitySelect.tsx';

const render = (value: PostVisibility): string =>
  String(jsx(PostVisibilitySelect, { value, onChange: () => {}, name: 'visibility' }));

describe('PostVisibilitySelect', () => {
  it('公開範囲の radiogroup に、公開・未収載・フォロワー限定の3つを出す', () => {
    const html = render('public');

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="公開範囲"');
    expect(html).toContain('公開');
    expect(html).toContain('未収載');
    expect(html).toContain('フォロワー限定');
    expect(html.match(/type="radio"/g)).toHaveLength(3);
  });

  it('各選択肢に name と value を付ける', () => {
    const html = render('public');

    expect(html).toContain('name="visibility"');
    expect(html).toContain('value="public"');
    expect(html).toContain('value="unlisted"');
    expect(html).toContain('value="private"');
  });

  it('各選択肢の説明を title に出す', () => {
    const html = render('public');

    expect(html).toContain('title="だれでも見られ、公開タイムラインにも出ます"');
    expect(html).toContain('title="だれでも見られますが、公開タイムラインには出ません"');
    expect(html).toContain('title="フォロワーだけが見られます"');
  });

  it.each(['public', 'unlisted', 'private'] as const)(
    'value が %s のとき、その選択肢だけを checked にする',
    (value) => {
      const html = render(value);
      const checked = [...html.matchAll(/<input[^>]*value="(\w+)"[^>]*checked/g)].map((match) => match[1]);

      expect(checked).toEqual([value]);
    },
  );
});
