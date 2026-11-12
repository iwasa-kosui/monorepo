import { useEffect, useRef, useState } from 'hono/jsx';

import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';
import {
  createOffscreenObserver,
  type HlsConstructor,
  type ObserveOffscreen,
  playButtonLabel,
  startVideoPlayback,
  type VideoAspectRatio,
  videoAspectRatioStyle,
  videoLabel,
} from './blueskyVideoPlayback.ts';

type Props = Readonly<{
  thumbnail: string | null;
  playlist: string;
  aspectRatio: VideoAspectRatio | null;
  alt: string | null;
  bskyHref: string | undefined;
}>;
type Phase = 'poster' | 'playing' | 'link';

const frameClass = 'relative block w-full max-h-96 overflow-hidden rounded-xl';
const posterBackgroundClass = 'bg-sand dark:bg-gray-700';
const posterClass = 'absolute inset-0 h-full w-full object-cover';

const observeOffscreen: ObserveOffscreen = (target, onOffscreen) =>
  createOffscreenObserver(
    typeof IntersectionObserver === 'undefined' ? undefined : (callback) => new IntersectionObserver(callback),
  )(target, onOffscreen);

const loadHls = async (): Promise<HlsConstructor> => (await import('hls.js')).default as unknown as HlsConstructor;

export const BlueskyVideoPlayer = ({ thumbnail, playlist, aspectRatio, alt, bskyHref }: Props) => {
  const thumbnailUrl = safeAbsoluteUrl(thumbnail);
  const playlistUrl = safeAbsoluteUrl(playlist);
  const [phase, setPhase] = useState<Phase>(playlistUrl === undefined ? 'link' : 'poster');
  const videoRef = useRef<HTMLVideoElement>(null);
  const fallbackRef = useRef<HTMLElement>(null);
  const failedWhilePlaying = useRef(false);
  const label = videoLabel(alt);
  const style = videoAspectRatioStyle(aspectRatio);
  const linkHref = bskyHref ?? playlistUrl;

  useEffect(() => {
    const video = videoRef.current;
    if (phase !== 'playing' || video === null || playlistUrl === undefined) return;
    const playback = startVideoPlayback({
      video,
      playlist: playlistUrl,
      loadHls,
      observeOffscreen,
      onFail: () => {
        failedWhilePlaying.current = true;
        setPhase('link');
      },
    });
    video.focus();
    return () => playback.stop();
  }, [phase]);

  useEffect(() => {
    if (phase !== 'link' || !failedWhilePlaying.current) return;
    failedWhilePlaying.current = false;
    fallbackRef.current?.focus();
  }, [phase]);

  if (phase === 'playing') {
    return (
      <div class={`${frameClass} bg-black`} style={style}>
        <video
          ref={videoRef}
          controls
          playsinline
          poster={thumbnailUrl}
          aria-label={label}
          class='absolute inset-0 h-full w-full object-contain'
        />
      </div>
    );
  }
  if (phase === 'link') {
    const content = (
      <>
        {thumbnailUrl !== undefined && <img src={thumbnailUrl} alt={label} class={posterClass} loading='lazy' />}
        <span class='absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white'>
          {linkHref === undefined ? '動画を再生できません' : '動画を Bluesky で開く'}
        </span>
      </>
    );
    return linkHref === undefined
      ? (
        <div
          ref={fallbackRef}
          tabindex={-1}
          class={`${frameClass} ${posterBackgroundClass}`}
          style={style}
        >
          {content}
        </div>
      )
      : (
        <a
          ref={fallbackRef}
          href={linkHref}
          target='_blank'
          rel='noopener noreferrer'
          class={`${frameClass} ${posterBackgroundClass}`}
          style={style}
        >
          {content}
        </a>
      );
  }
  return (
    <div class={`${frameClass} ${posterBackgroundClass}`} style={style}>
      {thumbnailUrl !== undefined && <img src={thumbnailUrl} alt={label} class={posterClass} loading='lazy' />}
      <button
        type='button'
        aria-label={playButtonLabel(alt)}
        onClick={() => setPhase('playing')}
        class='absolute inset-0 flex h-full w-full items-center justify-center bg-black/10 transition-colors hover:bg-black/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white'
      >
        <span class='flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white'>
          <svg xmlns='http://www.w3.org/2000/svg' class='h-7 w-7' viewBox='0 0 24 24' fill='currentColor'>
            <path d='M8 5v14l11-7z' />
          </svg>
        </span>
      </button>
    </div>
  );
};
