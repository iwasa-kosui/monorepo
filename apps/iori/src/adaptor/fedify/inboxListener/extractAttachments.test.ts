import { Note } from '@fedify/vocab';
import { describe, expect, it } from 'vitest';

import { extractAttachments } from './extractAttachments.ts';

describe('extractAttachments', () => {
  it('extracts the image URL from a Misskey Note attachment', async () => {
    const note = await Note.fromJsonLd({
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        {
          sensitive: 'as:sensitive',
          misskey: 'https://misskey-hub.net/ns#',
          _misskey_content: 'misskey:_misskey_content',
        },
      ],
      id: 'https://misskey.io/notes/at1w59fff4mr025w',
      type: 'Note',
      attributedTo: 'https://misskey.io/users/9go3h0fva0',
      content: '<p>x</p>',
      attachment: [{
        type: 'Document',
        mediaType: 'image/webp',
        url: 'https://media.misskeyusercontent.com/io/f306a9db-8c63-45fc-9b5a-f97ce80b2d5d.webp',
        name: null,
        sensitive: false,
      }],
      sensitive: false,
    });
    const documentLoader = () => {
      throw new Error('documentLoader must not be called');
    };

    const attachments = await extractAttachments(note as Note, documentLoader);

    expect(attachments).toEqual([{
      url: 'https://media.misskeyusercontent.com/io/f306a9db-8c63-45fc-9b5a-f97ce80b2d5d.webp',
      altText: null,
      mediaType: 'image/webp',
    }]);
  });

  const noLoad = () => {
    throw new Error('documentLoader must not be called');
  };

  const noteWith = (attachment: unknown[]) =>
    Note.fromJsonLd({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: 'https://remote.example/notes/1',
      type: 'Note',
      attributedTo: 'https://remote.example/users/alice',
      content: '<p>x</p>',
      attachment,
    }) as Promise<Note>;

  it('excludes attachments whose URL scheme is not http or https', async () => {
    const note = await noteWith([
      { type: 'Document', mediaType: 'image/png', url: 'javascript:alert(1)' },
      { type: 'Document', mediaType: 'image/png', url: 'data:image/png;base64,AAAA' },
      { type: 'Document', mediaType: 'image/png', url: 'http://remote.example/media/ok.png' },
    ]);

    const attachments = await extractAttachments(note, noLoad);

    expect(attachments).toEqual([{ url: 'http://remote.example/media/ok.png', altText: null, mediaType: 'image/png' }]);
  });

  it('returns Document and Image attachments in order with altText from name', async () => {
    const note = await noteWith([
      { type: 'Document', mediaType: 'image/png', url: 'https://remote.example/media/1.png', name: 'first' },
      { type: 'Image', url: 'https://remote.example/media/2.png', name: 'second' },
    ]);

    const attachments = await extractAttachments(note, noLoad);

    expect(attachments).toEqual([
      { url: 'https://remote.example/media/1.png', altText: 'first', mediaType: 'image/png' },
      { url: 'https://remote.example/media/2.png', altText: 'second', mediaType: null },
    ]);
  });

  it('excludes attachments that are not Document or Image', async () => {
    const note = await noteWith([
      { type: 'Note', id: 'https://remote.example/notes/2', content: 'nested' },
      { type: 'Link', href: 'https://remote.example/media/link.png' },
      { type: 'Document', mediaType: 'image/png', url: 'https://remote.example/media/1.png' },
    ]);

    const attachments = await extractAttachments(note, noLoad);

    expect(attachments).toEqual([{ url: 'https://remote.example/media/1.png', altText: null, mediaType: 'image/png' }]);
  });
});
