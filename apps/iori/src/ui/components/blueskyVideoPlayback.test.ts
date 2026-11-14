import { describe, expect, it, vi } from 'vitest';

import {
  createExclusivePlayback,
  createOffscreenObserver,
  decideVideoPlayback,
  type HlsConstructor,
  type ObserveOffscreen,
  startVideoPlayback,
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
    pause: vi.fn(),
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
    stopLoad: ReturnType<typeof vi.fn>;
    startLoad: ReturnType<typeof vi.fn>;
    emitError: ErrorHandler;
  }[] = [];
  class FakeHls {
    static Events = { ERROR: 'hlsError' };
    static isSupported = () => isSupported;
    attachMedia = vi.fn();
    loadSource = vi.fn();
    destroy = vi.fn();
    stopLoad = vi.fn();
    startLoad = vi.fn();
    private handler: ErrorHandler | undefined;
    constructor() {
      instances.push({
        attachMedia: this.attachMedia,
        loadSource: this.loadSource,
        destroy: this.destroy,
        stopLoad: this.stopLoad,
        startLoad: this.startLoad,
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

describe('createExclusivePlayback', () => {
  it('別の動画が claim したら、いま再生中の動画を止める', () => {
    const exclusive = createExclusivePlayback();
    const pauseA = vi.fn();
    const pauseB = vi.fn();

    exclusive.claim(pauseA);
    exclusive.claim(pauseA);
    expect(pauseA).not.toHaveBeenCalled();

    exclusive.claim(pauseB);
    expect(pauseA).toHaveBeenCalledTimes(1);
    expect(pauseB).not.toHaveBeenCalled();
  });

  it('release した動画は、後から別の動画が claim しても止めない', () => {
    const exclusive = createExclusivePlayback();
    const pauseA = vi.fn();

    exclusive.claim(pauseA);
    exclusive.release(pauseA);
    exclusive.claim(vi.fn());

    expect(pauseA).not.toHaveBeenCalled();
  });

  it('いま再生中でない動画の release は、再生中の記録を消さない', () => {
    const exclusive = createExclusivePlayback();
    const pauseA = vi.fn();
    const pauseB = vi.fn();

    exclusive.claim(pauseA);
    exclusive.release(pauseB);
    exclusive.claim(pauseB);

    expect(pauseA).toHaveBeenCalledTimes(1);
  });
});

describe('createOffscreenObserver', () => {
  const fakeObserver = () => {
    let callback: ((entries: readonly { isIntersecting: boolean }[]) => void) | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const create = vi.fn((cb: typeof callback) => {
      callback = cb;
      return { observe, disconnect };
    });
    return {
      create: create as never,
      observe,
      disconnect,
      emit: (...flags: boolean[]) => callback?.(flags.map((isIntersecting) => ({ isIntersecting }))),
    };
  };
  const target = {} as Element;

  it('対象を監視し、最新の通知が画面外のときだけ onOffscreen を呼ぶ', () => {
    const observer = fakeObserver();
    const onOffscreen = vi.fn();

    createOffscreenObserver(observer.create)(target, onOffscreen);
    observer.emit(true);
    expect(onOffscreen).not.toHaveBeenCalled();
    observer.emit(true, false);
    expect(onOffscreen).toHaveBeenCalledTimes(1);
    observer.emit(false, true);
    expect(onOffscreen).toHaveBeenCalledTimes(1);
    expect(observer.observe).toHaveBeenCalledWith(target);
  });

  it('戻り値の関数で disconnect する', () => {
    const observer = fakeObserver();

    createOffscreenObserver(observer.create)(target, vi.fn())();

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it('IntersectionObserver が無い環境では何も監視しない', () => {
    const onOffscreen = vi.fn();

    expect(() => createOffscreenObserver(undefined)(target, onOffscreen)()).not.toThrow();
    expect(onOffscreen).not.toHaveBeenCalled();
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

  const fakeOffscreen = () => {
    let onOffscreen: () => void = () => {};
    const disconnect = vi.fn();
    const observeOffscreen: ObserveOffscreen = (_target, callback) => {
      onOffscreen = callback;
      return disconnect;
    };
    return { observeOffscreen, disconnect, emitOffscreen: () => onOffscreen() };
  };

  it('hls で画面外に出たら video を pause し、hls.js の読み込みも止める', async () => {
    const { video, fake } = fakeVideo('');
    const { Hls, instances } = fakeHls(true);
    const { observeOffscreen, emitOffscreen } = fakeOffscreen();

    startVideoPlayback({
      video,
      playlist,
      loadHls: () => Promise.resolve(Hls),
      onFail: vi.fn(),
      observeOffscreen,
      exclusive: createExclusivePlayback(),
    });
    await flush();
    emitOffscreen();
    emitOffscreen();

    expect(fake.pause).toHaveBeenCalled();
    expect(instances[0]!.stopLoad).toHaveBeenCalledTimes(1);
  });

  it('画面外で止めたあと利用者が再生したら、hls.js の読み込みを再開する', async () => {
    const { video, listeners } = fakeVideo('');
    const { Hls, instances } = fakeHls(true);
    const { observeOffscreen, emitOffscreen } = fakeOffscreen();

    startVideoPlayback({
      video,
      playlist,
      loadHls: () => Promise.resolve(Hls),
      onFail: vi.fn(),
      observeOffscreen,
      exclusive: createExclusivePlayback(),
    });
    await flush();
    listeners.get('play')?.();
    expect(instances[0]!.startLoad).not.toHaveBeenCalled();
    emitOffscreen();
    listeners.get('play')?.();

    expect(instances[0]!.startLoad).toHaveBeenCalledTimes(1);
  });

  it('native で画面外に出たら pause だけして、hls.js は使わない', async () => {
    const { video, fake } = fakeVideo('maybe');
    const { observeOffscreen, emitOffscreen } = fakeOffscreen();

    startVideoPlayback({
      video,
      playlist,
      loadHls: vi.fn(),
      onFail: vi.fn(),
      observeOffscreen,
      exclusive: createExclusivePlayback(),
    });
    await flush();
    emitOffscreen();

    expect(fake.pause).toHaveBeenCalledTimes(1);
  });

  it('observeOffscreen を渡さなければ画面外を監視しない', async () => {
    const { video, fake } = fakeVideo('maybe');

    startVideoPlayback({ video, playlist, loadHls: vi.fn(), onFail: vi.fn(), exclusive: createExclusivePlayback() });
    await flush();

    expect(fake.pause).not.toHaveBeenCalled();
  });

  it('ある動画が再生を始めたら、ほかの再生中の動画を pause する', async () => {
    const exclusive = createExclusivePlayback();
    const first = fakeVideo('maybe');
    const second = fakeVideo('maybe');

    startVideoPlayback({ video: first.video, playlist, loadHls: vi.fn(), onFail: vi.fn(), exclusive });
    startVideoPlayback({ video: second.video, playlist, loadHls: vi.fn(), onFail: vi.fn(), exclusive });
    await flush();
    first.listeners.get('play')?.();
    expect(first.fake.pause).not.toHaveBeenCalled();
    second.listeners.get('play')?.();

    expect(first.fake.pause).toHaveBeenCalledTimes(1);
    expect(second.fake.pause).not.toHaveBeenCalled();
  });

  it('stop で play の監視を外し、observer を disconnect し、再生中の記録を解除する', async () => {
    const exclusive = createExclusivePlayback();
    const first = fakeVideo('maybe');
    const second = fakeVideo('maybe');
    const { observeOffscreen, disconnect } = fakeOffscreen();

    const { stop } = startVideoPlayback({
      video: first.video,
      playlist,
      loadHls: vi.fn(),
      onFail: vi.fn(),
      observeOffscreen,
      exclusive,
    });
    startVideoPlayback({ video: second.video, playlist, loadHls: vi.fn(), onFail: vi.fn(), exclusive });
    await flush();
    first.listeners.get('play')?.();
    stop();
    second.listeners.get('play')?.();

    expect(first.fake.removeEventListener).toHaveBeenCalledWith('play', expect.any(Function));
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(first.fake.pause).not.toHaveBeenCalled();
  });
});
