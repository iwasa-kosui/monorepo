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
