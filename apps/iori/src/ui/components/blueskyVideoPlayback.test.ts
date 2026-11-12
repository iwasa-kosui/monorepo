import { describe, expect, it, vi } from 'vitest';

import {
  decideVideoPlayback,
  type HlsConstructor,
  startVideoPlayback,
  videoAspectRatioStyle,
  videoLabel,
} from './blueskyVideoPlayback.ts';

type ErrorHandler = (event: string, data: { fatal: boolean }) => void;

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const fakeVideo = (canPlayType: string) => {
  const listeners = new Map<string, () => void>();
  const video = {
    src: '',
    canPlayType: vi.fn(() => canPlayType),
    play: vi.fn(() => Promise.resolve()),
    addEventListener: vi.fn((type: string, listener: () => void) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
  };
  return { video: video as unknown as HTMLVideoElement, fake: video, listeners };
};

const fakeHls = (isSupported: boolean) => {
  const instances: {
    attachMedia: ReturnType<typeof vi.fn>;
    loadSource: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    emitError: ErrorHandler;
  }[] = [];
  class FakeHls {
    static Events = { ERROR: 'hlsError' };
    static isSupported = () => isSupported;
    attachMedia = vi.fn();
    loadSource = vi.fn();
    destroy = vi.fn();
    private handler: ErrorHandler | undefined;
    constructor() {
      instances.push({
        attachMedia: this.attachMedia,
        loadSource: this.loadSource,
        destroy: this.destroy,
        emitError: (event, data) => this.handler?.(event, data),
      });
    }
    on(_event: string, handler: ErrorHandler) {
      this.handler = handler;
    }
  }
  return { Hls: FakeHls as unknown as HlsConstructor, instances };
};

describe('decideVideoPlayback', () => {
  it('video 要素が HLS を直接再生できれば native にして、hls.js を確かめない', async () => {
    const isHlsSupported = vi.fn(() => Promise.resolve(true));

    expect(await decideVideoPlayback('maybe', isHlsSupported)).toBe('native');
    expect(await decideVideoPlayback('probably', isHlsSupported)).toBe('native');
    expect(isHlsSupported).not.toHaveBeenCalled();
  });

  it('直接再生できず hls.js が使えれば hls にする', async () => {
    expect(await decideVideoPlayback('', () => Promise.resolve(true))).toBe('hls');
  });

  it('直接再生できず hls.js も使えなければ link にする', async () => {
    expect(await decideVideoPlayback('', () => Promise.resolve(false))).toBe('link');
  });

  it('hls.js の読み込みに失敗したら link にする', async () => {
    expect(await decideVideoPlayback('', () => Promise.reject(new Error('chunk')))).toBe('link');
  });
});

describe('videoAspectRatioStyle と videoLabel', () => {
  it('aspectRatio があればその比率、無ければ 16 / 9 にする', () => {
    expect(videoAspectRatioStyle({ width: 9, height: 16 })).toBe('aspect-ratio: 9 / 16');
    expect(videoAspectRatioStyle(null)).toBe('aspect-ratio: 16 / 9');
  });

  it('alt があれば alt、無ければ「動画」にする', () => {
    expect(videoLabel('走る猫')).toBe('走る猫');
    expect(videoLabel(null)).toBe('動画');
    expect(videoLabel('')).toBe('動画');
  });
});

describe('startVideoPlayback', () => {
  const playlist = 'https://video.example/playlist.m3u8';

  it('native なら src に playlist を入れて再生し、hls.js を読み込まない', async () => {
    const { video, fake } = fakeVideo('maybe');
    const loadHls = vi.fn();
    const onFail = vi.fn();

    startVideoPlayback({ video, playlist, loadHls, onFail });
    await flush();

    expect(fake.src).toBe(playlist);
    expect(fake.play).toHaveBeenCalled();
    expect(loadHls).not.toHaveBeenCalled();
    expect(onFail).not.toHaveBeenCalled();
  });

  it('native で video がエラーを出したら onFail を呼ぶ', async () => {
    const { video, listeners } = fakeVideo('maybe');
    const onFail = vi.fn();

    startVideoPlayback({ video, playlist, loadHls: vi.fn(), onFail });
    await flush();
    listeners.get('error')?.();

    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('hls なら hls.js に attachMedia と loadSource をさせ、stop で destroy する', async () => {
    const { video, fake } = fakeVideo('');
    const { Hls, instances } = fakeHls(true);
    const onFail = vi.fn();

    const { stop } = startVideoPlayback({ video, playlist, loadHls: () => Promise.resolve(Hls), onFail });
    await flush();

    expect(instances).toHaveLength(1);
    expect(instances[0]!.attachMedia).toHaveBeenCalledWith(video);
    expect(instances[0]!.loadSource).toHaveBeenCalledWith(playlist);
    expect(fake.src).toBe('');
    expect(fake.play).toHaveBeenCalled();

    stop();

    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(onFail).not.toHaveBeenCalled();
  });

  it('hls.js が fatal でないエラーを出しても続ける', async () => {
    const { video } = fakeVideo('');
    const { Hls, instances } = fakeHls(true);
    const onFail = vi.fn();

    startVideoPlayback({ video, playlist, loadHls: () => Promise.resolve(Hls), onFail });
    await flush();
    instances[0]!.emitError('hlsError', { fatal: false });

    expect(onFail).not.toHaveBeenCalled();
    expect(instances[0]!.destroy).not.toHaveBeenCalled();
  });

  it('hls.js が fatal なエラーを出したら destroy して onFail を 1 回だけ呼ぶ', async () => {
    const { video } = fakeVideo('');
    const { Hls, instances } = fakeHls(true);
    const onFail = vi.fn();

    const { stop } = startVideoPlayback({ video, playlist, loadHls: () => Promise.resolve(Hls), onFail });
    await flush();
    instances[0]!.emitError('hlsError', { fatal: true });
    instances[0]!.emitError('hlsError', { fatal: true });
    stop();

    expect(onFail).toHaveBeenCalledTimes(1);
    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1);
  });

  it('hls.js が使えない環境では onFail を呼ぶ', async () => {
    const { video } = fakeVideo('');
    const { Hls, instances } = fakeHls(false);
    const onFail = vi.fn();

    startVideoPlayback({ video, playlist, loadHls: () => Promise.resolve(Hls), onFail });
    await flush();

    expect(instances).toHaveLength(0);
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('hls.js の読み込みに失敗したら onFail を呼ぶ', async () => {
    const { video } = fakeVideo('');
    const onFail = vi.fn();

    startVideoPlayback({ video, playlist, loadHls: () => Promise.reject(new Error('chunk')), onFail });
    await flush();

    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('hls.js の読み込み中に stop すると、何も始めず onFail も呼ばない', async () => {
    const { video } = fakeVideo('');
    const { Hls, instances } = fakeHls(true);
    const onFail = vi.fn();

    const { stop } = startVideoPlayback({ video, playlist, loadHls: () => Promise.resolve(Hls), onFail });
    stop();
    await flush();

    expect(instances).toHaveLength(0);
    expect(onFail).not.toHaveBeenCalled();
  });
});
