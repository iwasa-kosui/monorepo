import { expect, it } from 'vitest';

import { parseUploadFilenameImageId, postImageObjectKey } from '../../src/adaptor/r2/postImageObjectStore.ts';
import { classifyUploadUrl, createUploadTracker, requireSourceOrigin } from '../migration-upload-rows.mjs';

const uuid = '55555555-5555-4555-8555-555555555555';

const localOf = (url: string) => {
  const upload = classifyUploadUrl(url);
  if (upload.kind !== 'local') throw new Error(`expected a local upload: ${url}`);
  return upload;
};

it('classifies a local upload and derives the file name, R2 key and content type from the URL', () => {
  expect(classifyUploadUrl(`/uploads/${uuid}.png`)).toEqual({
    kind: 'local',
    uuid,
    filename: `${uuid}.png`,
    key: `post-images/${uuid}/original`,
    contentType: 'image/png',
  });
  expect(localOf(`/uploads/${uuid}.jpg`).contentType).toBe('image/jpeg');
  expect(localOf(`/uploads/${uuid}.jpeg`).contentType).toBe('image/jpeg');
  expect(localOf(`/uploads/${uuid}.gif`).contentType).toBe('image/gif');
  expect(localOf(`/uploads/${uuid}.webp`).contentType).toBe('image/webp');
  expect(localOf(`/uploads/${uuid}.PNG`).contentType).toBe('image/png');
});

it('keeps the upper case letters of the UUID written in the URL', () => {
  const upper = 'ABCDEF01-2345-4678-9ABC-DEF012345678';
  const upload = localOf(`/uploads/${upper}.Png`);
  expect(upload.uuid).toBe(upper);
  expect(upload.filename).toBe(`${upper}.Png`);
  expect(upload.key).toBe(`post-images/${upper}/original`);
  expect(upload.contentType).toBe('image/png');
});

it('accepts the UUID versions 1 to 8 and rejects the others', () => {
  for (const version of ['1', '4', '7', '8']) {
    expect(classifyUploadUrl(`/uploads/55555555-5555-${version}555-8555-555555555555.png`).kind).toBe('local');
  }
  for (const version of ['0', '9']) {
    expect(classifyUploadUrl(`/uploads/55555555-5555-${version}555-8555-555555555555.png`).kind).toBe('invalid');
  }
  expect(classifyUploadUrl('/uploads/55555555-5555-4555-c555-555555555555.png').kind).toBe('invalid');
});

it('classifies absolute http and https URLs as remote, including URLs longer than 128 bytes', () => {
  expect(classifyUploadUrl('https://remote.test/media/a.png')).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl('http://remote.test/a.png')).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl(`https://remote.test/${'x'.repeat(300)}.png`)).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl(`https://remote.test/${'x'.repeat(100)}`.slice(0, 128))).toEqual({ kind: 'remote' });
});

const origin = 'https://example.com/';

it('classifies absolute URLs under /uploads/ of the source origin as same-origin', () => {
  expect(classifyUploadUrl(`https://example.com/uploads/${uuid}.webp`, origin)).toEqual({ kind: 'same-origin' });
  expect(classifyUploadUrl(`https://Example.com:443/uploads/${uuid}.webp`, origin)).toEqual({ kind: 'same-origin' });
  expect(classifyUploadUrl(`HTTPS://EXAMPLE.com/uploads/${uuid}.webp`, 'https://example.com:443')).toEqual({
    kind: 'same-origin',
  });
  expect(classifyUploadUrl(`https://example.com/static/uploads/${uuid}.webp`, origin)).toEqual({
    kind: 'same-origin',
  });
});

it('keeps absolute URLs outside /uploads/ or on another origin remote', () => {
  expect(classifyUploadUrl(`https://other.example/uploads/${uuid}.webp`, origin)).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl(`http://example.com/uploads/${uuid}.webp`, origin)).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl(`https://example.com:8443/uploads/${uuid}.webp`, origin)).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl('https://example.com/other/a.png', origin)).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl('https://example.com/uploads/../other/a.png', origin)).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl('HTTPS://other.example/x.png', origin)).toEqual({ kind: 'remote' });
  expect(classifyUploadUrl(`https://example.com/uploads/${uuid}.webp`)).toEqual({ kind: 'remote' });
});

it('classifies absolute URLs that cannot be parsed as invalid', () => {
  expect(classifyUploadUrl('https://', origin)).toEqual({ kind: 'invalid' });
  expect(classifyUploadUrl('http://exa mple.com/uploads/a.png', origin)).toEqual({ kind: 'invalid' });
});

it('classifies a same-origin URL cut at 128 characters the same way as the full URL', () => {
  const full = `https://example.com/uploads/${'x'.repeat(200)}.png`;
  expect(classifyUploadUrl(full, origin)).toEqual({ kind: 'same-origin' });
  expect(classifyUploadUrl(full.slice(0, 128), origin)).toEqual({ kind: 'same-origin' });
});

it('requires the source origin to be an absolute http or https URL', () => {
  expect(requireSourceOrigin('https://Example.com:443/')).toBe('https://example.com');
  expect(() => requireSourceOrigin(undefined)).toThrow('source-origin-required');
  expect(() => requireSourceOrigin('')).toThrow('source-origin-required');
  expect(() => requireSourceOrigin('example.com')).toThrow('source-origin-required');
  expect(() => classifyUploadUrl('https://remote.test/a.png', 'example.com')).toThrow('source-origin-required');
});

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
