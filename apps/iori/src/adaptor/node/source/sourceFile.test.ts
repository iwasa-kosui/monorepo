import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { beforeEach, expect, it, vi } from 'vitest';

import { openSourceFile } from './sourceFile.ts';

vi.mock('node:fs/promises', () => ({ lstat: vi.fn(), open: vi.fn(), realpath: vi.fn() }));
const regular = () => ({
  isFile: () => true,
  size: 10,
  uid: process.getuid?.(),
  mode: 0o100600,
  dev: 1,
  ino: 2,
});
const close = vi.fn(async () => {});
const stat = vi.fn(async () => regular());
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(realpath).mockResolvedValue('/private/root');
  vi.mocked(lstat).mockResolvedValue(regular() as Awaited<ReturnType<typeof lstat>>);
  vi.mocked(open).mockResolvedValue({ stat, close } as unknown as Awaited<ReturnType<typeof open>>);
  stat.mockResolvedValue(regular());
});
it('rejects nonregular paths before opening, including a mocked FIFO', async () => {
  vi.mocked(lstat).mockResolvedValue({ ...regular(), isFile: () => false } as Awaited<ReturnType<typeof lstat>>);
  await expect(openSourceFile('/private/root/file', 100)).rejects.toThrow('unsafe_file');
  expect(open).not.toHaveBeenCalled();
});
it('opens regular files without blocking or following links and verifies the opened identity', async () => {
  await openSourceFile('/private/root/file', 100);
  expect(open).toHaveBeenCalledWith(
    '/private/root/file',
    constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
  );
  expect(stat).toHaveBeenCalledOnce();
});
it.each(['type', 'inode', 'device', 'owner', 'size'] as const)(
  'closes and rejects a replaced %s after opening',
  async (changed) => {
    const after = regular();
    if (changed === 'type') after.isFile = () => false;
    if (changed === 'inode') after.ino++;
    if (changed === 'device') after.dev++;
    if (changed === 'owner') after.uid = (after.uid ?? 0) + 1;
    if (changed === 'size') after.size++;
    stat.mockResolvedValue(after);
    await expect(openSourceFile('/private/root/file', 100)).rejects.toThrow('unsafe_file');
    expect(close).toHaveBeenCalledOnce();
  },
);
const failure = async (privateFile = true) =>
  openSourceFile('/private/root/file', 100, privateFile).catch((error) => error);
const errno = (code: string) => Object.assign(new Error(code), { code });
const lstatAs = (override: object) =>
  vi.mocked(lstat).mockResolvedValue({ ...regular(), ...override } as Awaited<ReturnType<typeof lstat>>);
it.each(['ENOENT', 'ENOTDIR'])('gives a lstat failure with %s the reason missing', async (code) => {
  vi.mocked(lstat).mockRejectedValue(errno(code));
  expect(await failure()).toMatchObject({ message: code, reason: 'missing' });
  expect(open).not.toHaveBeenCalled();
});
it.each(['ENOENT', 'ENOTDIR'])('gives an open failure with %s the reason missing', async (code) => {
  vi.mocked(open).mockRejectedValueOnce(errno(code));
  expect(await failure()).toMatchObject({ message: code, reason: 'missing' });
});
it.each(['EACCES', 'EPERM'])('gives a lstat or open failure with %s the reason access', async (code) => {
  vi.mocked(lstat).mockRejectedValueOnce(errno(code));
  expect(await failure()).toMatchObject({ message: code, reason: 'access' });
  vi.mocked(open).mockRejectedValueOnce(errno(code));
  expect(await failure()).toMatchObject({ message: code, reason: 'access' });
});
it('gives a file owned by another user the reason owner, before and after opening', async () => {
  lstatAs({ uid: (process.getuid?.() ?? 0) + 1 });
  expect(await failure()).toMatchObject({ message: 'unsafe_file', reason: 'owner' });
  expect(open).not.toHaveBeenCalled();
  lstatAs({});
  stat.mockResolvedValue({ ...regular(), uid: (process.getuid?.() ?? 0) + 1 });
  expect(await failure(false)).toMatchObject({ message: 'unsafe_file', reason: 'owner' });
  expect(close).toHaveBeenCalledOnce();
});
it('gives a path that is not a regular file the reason not-regular, before and after opening', async () => {
  lstatAs({ isFile: () => false });
  expect(await failure()).toMatchObject({ message: 'unsafe_file', reason: 'not-regular' });
  lstatAs({});
  stat.mockResolvedValue({ ...regular(), isFile: () => false });
  expect(await failure()).toMatchObject({ message: 'unsafe_file', reason: 'not-regular' });
});
it('gives a file above the size limit the reason too-large, before and after opening', async () => {
  lstatAs({ size: 101 });
  expect(await failure()).toMatchObject({ message: 'unsafe_file', reason: 'too-large' });
  expect(open).not.toHaveBeenCalled();
  lstatAs({});
  stat.mockResolvedValue({ ...regular(), size: 101 });
  expect(await failure()).toMatchObject({ message: 'unsafe_file', reason: 'too-large' });
});
it('gives every other failure the reason other', async () => {
  vi.mocked(realpath).mockResolvedValue('/elsewhere');
  expect(await failure()).toMatchObject({ message: 'unsafe_file', reason: 'other' });
  vi.mocked(realpath).mockResolvedValue('/private/root');
  lstatAs({ mode: 0o100644 });
  expect(await failure()).toMatchObject({ message: 'unsafe_file', reason: 'other' });
  expect(await failure(false)).not.toBeInstanceOf(Error);
  lstatAs({});
  vi.mocked(open).mockRejectedValueOnce(errno('ELOOP'));
  expect(await failure()).toMatchObject({ message: 'ELOOP', reason: 'other' });
  vi.mocked(lstat).mockRejectedValueOnce(errno('EIO'));
  expect(await failure()).toMatchObject({ message: 'EIO', reason: 'other' });
  stat.mockResolvedValue({ ...regular(), ino: 3 });
  expect(await failure()).toMatchObject({ message: 'unsafe_file', reason: 'other' });
  stat.mockResolvedValue({ ...regular(), size: 11 });
  expect(await failure()).toMatchObject({ message: 'unsafe_file', reason: 'other' });
});
