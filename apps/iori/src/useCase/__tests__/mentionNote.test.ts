import { Mention } from '@fedify/vocab';
import { describe, expect, it } from 'vitest';

import { toMentionNoteFields } from '../helper/mentionNote.ts';

const mention = (href: string, name: string) =>
  `<span class="h-card"><a href="${href}" class="u-url mention">@<span>${name}</span></a></span>`;

describe('toMentionNoteFields', () => {
  it('本文の a.mention から、href が actor の id で name が @user@host の Mention タグを作る', () => {
    const { tags, ccs } = toMentionNoteFields(
      `<p>${mention('https://remote.example/users/alice', 'alice@remote.example')}</p>`,
    );

    expect(tags).toHaveLength(1);
    expect(tags[0]).toBeInstanceOf(Mention);
    expect(tags[0]?.href?.href).toBe('https://remote.example/users/alice');
    expect(tags[0]?.name?.toString()).toBe('@alice@remote.example');
    expect(ccs.map((url) => url.href)).toEqual(['https://remote.example/users/alice']);
  });

  it('本文に無い追加の actor もタグと cc に入れ、本文と重なる actor は 1 件にする', () => {
    const { tags, ccs } = toMentionNoteFields(mention('https://remote.example/users/alice', 'alice@remote.example'), [
      { id: new URL('https://remote.example/users/alice'), name: '@alice@remote.example' },
      { id: new URL('https://other.example/users/bob'), name: '@bob@other.example' },
    ]);

    expect(tags.map((tag) => tag.href?.href)).toEqual([
      'https://remote.example/users/alice',
      'https://other.example/users/bob',
    ]);
    expect(ccs).toHaveLength(2);
  });
});
