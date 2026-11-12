import { describe, expect, it } from 'vitest';

import { attachmentKindOf } from './attachmentKind.ts';

describe('attachmentKindOf', () => {
  it.each(
    [
      ['video/mp4', 'https://remote.example/media/1.bin', 'video'],
      ['audio/mpeg', 'https://remote.example/media/1.bin', 'audio'],
      ['image/png', 'https://remote.example/media/1.bin', 'image'],
      ['VIDEO/WebM; codecs=vp9', 'https://remote.example/media/1.bin', 'video'],
      ['video/ogg', 'https://remote.example/media/1.ogg', 'video'],
      ['image/gif', 'https://remote.example/media/1.mp4', 'image'],
    ] as const,
  )('mediaType が %s なら、URL %s の拡張子によらず %s', (mediaType, url, expected) => {
    expect(attachmentKindOf({ url, mediaType })).toBe(expected);
  });

  it.each(
    [
      ['mp4', 'video'],
      ['m4v', 'video'],
      ['mov', 'video'],
      ['webm', 'video'],
      ['mp3', 'audio'],
      ['m4a', 'audio'],
      ['ogg', 'audio'],
      ['oga', 'audio'],
      ['opus', 'audio'],
      ['wav', 'audio'],
      ['flac', 'audio'],
      ['png', 'image'],
      ['jpg', 'image'],
    ] as const,
  )('mediaType が null なら、拡張子 %s から %s と推定する', (extension, expected) => {
    expect(attachmentKindOf({ url: `https://remote.example/media/1.${extension}`, mediaType: null })).toBe(expected);
  });

  it.each(['application/octet-stream', 'application/ogg', ''])(
    'mediaType が %j のように種類を決められなければ、拡張子で推定する',
    (mediaType) => {
      expect(attachmentKindOf({ url: 'https://remote.example/media/1.ogg', mediaType })).toBe('audio');
      expect(attachmentKindOf({ url: 'https://remote.example/media/1.mp4', mediaType })).toBe('video');
    },
  );

  it('拡張子は URL のパスだけで見て、クエリとフラグメントと大文字小文字を無視する', () => {
    expect(attachmentKindOf({ url: 'https://remote.example/media/1.MP4?name=a.png#t=1', mediaType: null })).toBe(
      'video',
    );
    expect(attachmentKindOf({ url: 'https://remote.example/media/1?file=a.mp4', mediaType: null })).toBe('image');
  });

  it('相対パスでも拡張子で推定する', () => {
    expect(attachmentKindOf({ url: '/uploads/a.webm', mediaType: null })).toBe('video');
  });

  it('mediaType も拡張子も無ければ image とする', () => {
    expect(attachmentKindOf({ url: 'https://remote.example/media/1', mediaType: null })).toBe('image');
    expect(attachmentKindOf({ url: 'https://remote.example/media/1' })).toBe('image');
  });
});
