import type HlsModule from 'hls.js';

export type VideoPlaybackMethod = 'native' | 'hls' | 'link';
export type HlsConstructor = typeof HlsModule.default;
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

type StartVideoPlaybackInput = Readonly<{
  video: HTMLVideoElement;
  playlist: string;
  loadHls: () => Promise<HlsConstructor>;
  onFail: () => void;
}>;

export const startVideoPlayback = ({ video, playlist, loadHls, onFail }: StartVideoPlaybackInput): Readonly<{
  stop: () => void;
}> => {
  let stopped = false;
  let cleanup = (): void => {};
  const stop = (): void => {
    stopped = true;
    cleanup();
    cleanup = () => {};
  };
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
      cleanup = () => video.removeEventListener('error', fail);
      video.src = playlist;
      play();
      return;
    }
    if (method === 'link' || hls === undefined) {
      fail();
      return;
    }
    const instance = new hls();
    cleanup = () => instance.destroy();
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
