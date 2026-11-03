import { Note } from '@fedify/fedify';
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
        mediaType: 'image/png',
        url: 'https://media.misskeyusercontent.com/io/f306a9db-8c63-45fc-9b5a-f97ce80b2d5d.png',
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
      url: 'https://media.misskeyusercontent.com/io/f306a9db-8c63-45fc-9b5a-f97ce80b2d5d.png',
      altText: null,
    }]);
  });
});
