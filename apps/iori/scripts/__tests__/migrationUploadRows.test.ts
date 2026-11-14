import { expect, it } from 'vitest';

import { parseUploadFilenameImageId, postImageObjectKey } from '../../src/adaptor/r2/postImageObjectStore.ts';
import { classifyUploadUrl, createUploadTracker, requireSourceHostname } from '../migration-upload-rows.mjs';

const uuid = '55555555-5555-4555-8555-555555555555';

const localOf = (url: string) => {
  const upload = classifyUploadUrl(url);
  if (upload.kind !== 'local') throw new Error(`expected a local upload: ${url}`);
  return upload;
};

it('classifies absolute http and https URLs as remote, including URLs longer than 128 bytes', () => {
  expect(classifyUploadUrl('https://remote.test/media/a.png')).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl('http://remote.test/a.png')).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl(`https://remote.test/${'x'.repeat(300)}.png`)).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl(`https://remote.test/${'x'.repeat(100)}`.slice(0, 128))).toEqual({ kind: 'remote' });
});

const hostname = requireSourceHostname('https://example.com/');

it('classifies absolute URLs under /uploads/ of the source host as same-origin', () => {
  expect(classifyUploadUrl(`https://example.com/uploads/${uuid}.webp`, hostname)).toEqual({ kind: 'same-origin' });
  expect(classifyUploadUrl(`https://Example.com:443/uploads/${uuid}.webp`, hostname)).toEqual({ kind: 'same-origin' });
  expect(classifyUploadUrl(`HTTPS://EXAMPLE.com/uploads/${uuid}.webp`, hostname)).toEqual({ kind: 'same-origin' });
  expect(classifyUploadUrl(`https://example.com/static/uploads/${uuid}.webp`, hostname)).toEqual({
    kind: 'same-origin',
  });
});

it('treats another scheme or port of the source host as same-origin', () => {
  expect(classifyUploadUrl(`http://example.com/uploads/${uuid}.webp`, hostname)).toEqual({ kind: 'same-origin' });
  expect(classifyUploadUrl(`https://example.com:8443/uploads/${uuid}.webp`, hostname)).toEqual({
    kind: 'same-origin',
  });
});

it('keeps absolute URLs outside /uploads/ or on another host remote', () => {
  expect(classifyUploadUrl(`https://other.example/uploads/${uuid}.webp`, hostname)).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl(`http://other.example:8443/uploads/${uuid}.webp`, hostname)).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl('https://example.com/other/a.png', hostname)).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl('https://example.com/uploads/../other/a.png', hostname)).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl('HTTPS://other.example/x.png', hostname)).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl(`https://example.com/uploads/${uuid}.webp`)).toEqual({ kind: 'remote' });
});

it('classifies absolute URLs that cannot be parsed as invalid', () => {
  expect(classifyUploadUrl('https://', hostname)).toEqual({ kind: 'invalid' });
  expect(classifyUploadUrl('http://exa mple.com/uploads/a.png', hostname)).toEqual({ kind: 'invalid' });
});

it('classifies a same-origin URL cut at 128 characters the same way as the full URL', () => {
  const full = `https://example.com/uploads/${'x'.repeat(200)}.png`;
  expect(classifyUploadUrl(full, hostname)).toEqual({ kind: 'same-origin' });
  expect(classifyUploadUrl(full.slice(0, 128), hostname)).toEqual({ kind: 'same-origin' });
});

it.each([
  undefined,
  null,
  42,
  '',
  'example.com',
  '//example.com',
  'ftp://example.com',
  'https://',
  'http://exa mple.com',
])(
  'rejects %j as a source origin',
  (value) => {
    expect(() => requireSourceHostname(value)).toThrow('source-origin-required');
  },
);

it('classifies URLs under /static/uploads/ as legacy', () => {
  expect(classifyUploadUrl(`/static/uploads/${uuid}.png`)).toEqual({ kind: 'legacy' });
  expect(classifyUploadUrl('/static/uploads/anything')).toEqual({ kind: 'legacy' });
});

it.each([
  '/uploads/../x.png',
  `/uploads/${uuid}.txt`,
  `/uploads/${uuid}.png/extra`,
  `/uploads/nested/${uuid}.png`,
  `uploads/${uuid}.png`,
  `data:image/png;base64,AAAA`,
  'ftp://remote.test/a.png',
  '',
  null,
  undefined,
  42,
  { url: `/uploads/${uuid}.png` },
])('classifies %j as invalid', (url) => {
  expect(classifyUploadUrl(url)).toEqual({ kind: 'invalid' });
});

it('counts the unique files and the duplicate rows of local uploads', () => {
  const tracker = createUploadTracker();
  const other = '66666666-6666-4666-8666-666666666666';
  expect(tracker.add(localOf(`/uploads/${uuid}.png`))).toBe('new');
  expect(tracker.add(localOf(`/uploads/${uuid}.png`))).toBe('duplicate');
  expect(tracker.add(localOf(`/uploads/${other}.webp`))).toBe('new');
  expect(tracker.add(localOf(`/uploads/${uuid}.png`))).toBe('duplicate');
  expect(tracker.uniqueCount).toBe(2);
  expect(tracker.duplicateCount).toBe(2);
  expect(tracker.has(`post-images/${uuid}/original`)).toBe(true);
  expect(tracker.has(`post-images/${other}/original`)).toBe(true);
  expect(tracker.has('post-images/missing/original')).toBe(false);
});

it('treats the same R2 key with a different file name as a conflict', () => {
  const tracker = createUploadTracker();
  expect(tracker.add(localOf(`/uploads/${uuid}.png`))).toBe('new');
  expect(tracker.add(localOf(`/uploads/${uuid}.jpg`))).toBe('conflict');
});

it.each([
  `/uploads/${uuid}.png`,
  `/uploads/${uuid.toUpperCase()}.webp`,
  '/uploads/0192f1c2-7d3e-7a10-9b2c-3d4e5f607182.jpeg',
])('builds the same R2 key as the Worker reads for %s', (url) => {
  const upload = localOf(url);
  const imageId = parseUploadFilenameImageId(upload.filename);
  if (!imageId.ok) throw new Error('the Worker rejects the URL');
  expect(upload.key).toBe(postImageObjectKey(imageId.val));
});
