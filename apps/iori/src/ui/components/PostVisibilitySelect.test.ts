import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { PostVisibility } from './postVisibility.ts';
import { PostVisibilitySelect } from './PostVisibilitySelect.tsx';

const render = (value: PostVisibility, id?: string): string =>
  String(jsx(PostVisibilitySelect, { value, onChange: () => {}, name: 'visibility', id }));

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

  it.each(
    [
      ['public', 'だれでも見られ、公開タイムラインにも出ます'],
      ['unlisted', 'だれでも見られますが、公開タイムラインには出ません'],
      ['private', 'フォロワーだけが見られます'],
    ] as const,
  )(
    'value が %s のとき、選択欄の下にその説明だけを出し、radiogroup に aria-describedby で結び付ける',
    (value, description) => {
      const html = render(value);

      expect(html).toContain('aria-describedby="visibility-description"');
      expect(html).toMatch(new RegExp(`<p[^>]*id="visibility-description"[^>]*>${description}</p>`));
      expect(html.match(/id="visibility-description"/g)).toHaveLength(1);
    },
  );

  it('id を渡したとき、説明の id をそれから作る', () => {
    const html = render('public', 'post-modal-form-visibility');

    expect(html).toContain('aria-describedby="post-modal-form-visibility-description"');
    expect(html).toContain('id="post-modal-form-visibility-description"');
  });

  it.each(['public', 'unlisted', 'private'] as const)(
    'value が %s のとき、その選択肢だけを checked にする',
    (value) => {
      const html = render(value);
      const checked = [...html.matchAll(/<input[^>]*value="(\w+)"[^>]*checked/g)].map((match) => match[1]);

      expect(checked).toEqual([value]);
    },
  );

  it('disabled のとき、3つの選択肢をすべて無効にする', () => {
    const html = String(
      jsx(PostVisibilitySelect, { value: 'public', onChange: () => {}, name: 'visibility', disabled: true }),
    );

    expect(html.match(/<input[^>]*disabled=""/g)).toHaveLength(3);
  });

  it('disabled を渡さなければ、選択肢を無効にしない', () => {
    expect(render('public')).not.toContain('disabled');
  });
});
