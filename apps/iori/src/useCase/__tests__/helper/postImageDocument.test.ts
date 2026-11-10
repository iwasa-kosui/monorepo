import { describe, expect, it } from 'vitest';

import { toImageDocument } from '../../helper/postImageDocument.ts';

describe('toImageDocument', () => {
  it('altText が空でなければ name に入れる', () => {
    const document = toImageDocument({ url: '/media/a.jpg', altText: '猫の写真' }, 'https://example.com');

    expect(document.name?.toString()).toBe('猫の写真');
    expect(document.url?.href).toBe('https://example.com/media/a.jpg');
    expect(document.mediaType).toBe('image/jpeg');
  });

  it.each([null, ''])('altText が %j なら name を付けない', (altText) => {
    const document = toImageDocument({ url: 'https://example.com/a.png', altText }, 'https://example.com');

    expect(document.name).toBeNull();
  });
});
