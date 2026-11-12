import type HlsModule from 'hls.js';

export type VideoPlaybackMethod = 'native' | 'hls' | 'link';
export type HlsConstructor = typeof HlsModule;
export type VideoAspectRatio = Readonly<{ width: number; height: number }>;

const HLS_MIME_TYPE = 'application/vnd.apple.mpegurl';
const DEFAULT_ASPECT_RATIO = '16 / 9';

export const decideVideoPlayback = async (
  canPlayType: string,
  isHlsSupported: () => Promise<boolean>,
): Promise<VideoPlaybackMethod> => {
  if (canPlayType !== '') return 'native';
  try {
    return (await isHlsSupported()) ? 'hls' : 'link';
  } catch {
    return 'link';
  }
};

export const videoAspectRatioStyle = (aspectRatio: VideoAspectRatio | null): string =>
  `aspect-ratio: ${aspectRatio === null ? DEFAULT_ASPECT_RATIO : `${aspectRatio.width} / ${aspectRatio.height}`}`;

export const videoLabel = (alt: string | null): string => alt === null || alt === '' ? '動画' : alt;

export const playButtonLabel = (alt: string | null): string =>
  alt === null || alt === '' ? '動画を再生' : `動画を再生: ${alt}`;

export type ExclusivePlayback = Readonly<{
  claim: (pause: () => void) => void;
  release: (pause: () => void) => void;
}>;

export const createExclusivePlayback = (): ExclusivePlayback => {
  let current: (() => void) | undefined;
  return {
    claim: (pause) => {
      if (current !== undefined && current !== pause) current();
      current = pause;
    },
    release: (pause) => {
      if (current === pause) current = undefined;
    },
  };
};

const sharedExclusivePlayback = createExclusivePlayback();

export type ObserveOffscreen = (target: Element, onOffscreen: () => void) => () => void;
export type OffscreenObserverFactory = (
  callback: (entries: readonly Readonly<{ isIntersecting: boolean }>[]) => void,
) => Readonly<{ observe: (target: Element) => void; disconnect: () => void }>;

export const createOffscreenObserver = (
  createObserver: OffscreenObserverFactory | undefined,
): ObserveOffscreen =>
(target, onOffscreen) => {
  if (createObserver === undefined) return () => {};
  const observer = createObserver((entries) => {
    if (entries[entries.length - 1]?.isIntersecting === false) onOffscreen();
  });
  observer.observe(target);
  return () => observer.disconnect();
};

type StartVideoPlaybackInput = Readonly<{
  video: HTMLVideoElement;
  playlist: string;
  loadHls: () => Promise<HlsConstructor>;
  onFail: () => void;
  observeOffscreen?: ObserveOffscreen;
  exclusive?: ExclusivePlayback;
}>;

export const startVideoPlayback = (
  { video, playlist, loadHls, onFail, observeOffscreen, exclusive = sharedExclusivePlayback }: StartVideoPlaybackInput,
): Readonly<{
  stop: () => void;
}> => {
  let stopped = false;
  let hlsInstance: InstanceType<HlsConstructor> | undefined;
  let loadStopped = false;
  const cleanups: (() => void)[] = [];
  const stop = (): void => {
    stopped = true;
    hlsInstance = undefined;
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
  const suspend = (): void => {
    video.pause();
    if (hlsInstance === undefined || loadStopped) return;
    hlsInstance.stopLoad();
    loadStopped = true;
  };
  const onPlay = (): void => {
    if (hlsInstance !== undefined && loadStopped) {
      hlsInstance.startLoad();
      loadStopped = false;
    }
    exclusive.claim(suspend);
  };
  video.addEventListener('play', onPlay);
  cleanups.push(() => {
    video.removeEventListener('play', onPlay);
    exclusive.release(suspend);
  });
  if (observeOffscreen !== undefined) cleanups.push(observeOffscreen(video, suspend));
  const fail = (): void => {
    if (stopped) return;
    stop();
    onFail();
  };
  const play = (): void => {
    void Promise.resolve(video.play()).catch(() => {});
  };
  const run = async (): Promise<void> => {
    let hls: HlsConstructor | undefined;
    const method = await decideVideoPlayback(video.canPlayType(HLS_MIME_TYPE), async () => {
      hls = await loadHls();
      return hls.isSupported();
    });
    if (stopped) return;
    if (method === 'native') {
      video.addEventListener('error', fail);
      cleanups.push(() => video.removeEventListener('error', fail));
      video.src = playlist;
      play();
      return;
    }
    if (method === 'link' || hls === undefined) {
      fail();
      return;
    }
    const instance = new hls();
    hlsInstance = instance;
    cleanups.push(() => instance.destroy());
    instance.on(hls.Events.ERROR, (_event, data) => {
      if (data.fatal) fail();
    });
    instance.attachMedia(video);
    instance.loadSource(playlist);
    play();
  };
  run().catch(fail);
  return { stop };
};
