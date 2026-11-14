import { describe, expect, it } from 'vitest';

import { accountNoteExcerpt } from './FediverseAccountRow.tsx';

describe('accountNoteExcerpt', () => {
  it('タグを取り除き、文字参照を戻し、空白をまとめる', () => {
    expect(accountNoteExcerpt('<p>Hello&nbsp;<a href="#">world</a></p><p>A &amp; B &#x1F600; &#65;</p>'))
      .toBe('Hello world A & B 😀 A');
  });

  it('長いプロフィール文を切り詰める', () => {
    const excerpt = accountNoteExcerpt(`<p>${'あ'.repeat(200)}</p>`);

    expect([...excerpt]).toHaveLength(121);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});

