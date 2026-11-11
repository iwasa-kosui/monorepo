import { useEffect, useRef, useState } from 'hono/jsx';

import { isPullArmed, PULL_TO_REFRESH_THRESHOLD, pullPhaseAfterRelease, rubberBand } from './pullGesture.ts';

export type PullPhase = 'idle' | 'pulling' | 'refreshing' | 'done';

export type UsePullToRefreshReturn = Readonly<{
  /** 指の移動量に抵抗をかけた、インジケーターの高さ。 */
  pullDistance: number;
  phase: PullPhase;
  /** しきい値を越えていて、離すと更新される状態か。 */
  isArmed: boolean;
  /** 直前の更新で増えた件数。置き換えや失敗のときは undefined。 */
  resultCount: number | undefined;
}>;

type UsePullToRefreshProps = Readonly<{
  onRefresh: () => Promise<number | undefined>;
}>;

/** 更新結果を表示しておく時間。 */
const DONE_DISPLAY_MS = 900;

const isInsideOverlay = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('.fixed, [role="dialog"], dialog') !== null;

const vibrate = (ms: number): void => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    return;
  }
};

export const usePullToRefresh = ({ onRefresh }: UsePullToRefreshProps): UsePullToRefreshReturn => {
  const [pullDistance, setPullDistance] = useState(0);
  const [phase, setPhase] = useState<PullPhase>('idle');
  const [resultCount, setResultCount] = useState<number | undefined>(undefined);
  const phaseRef = useRef<PullPhase>('idle');
  const startYRef = useRef<number | undefined>(undefined);
  const distanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    // Chrome などのブラウザ標準の引っ張って更新と競合しないようにする
    const root = document.documentElement;
    const previousOverscroll = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = 'contain';
    let doneTimer: ReturnType<typeof setTimeout> | undefined;

    const changePhase = (next: PullPhase) => {
      phaseRef.current = next;
      setPhase(next);
    };

    const changeDistance = (next: number) => {
      const wasArmed = isPullArmed(distanceRef.current ?? 0);
      distanceRef.current = next;
      setPullDistance(next);
      if (!wasArmed && isPullArmed(next)) vibrate(8);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (phaseRef.current !== 'idle' || e.touches.length !== 1 || window.scrollY > 0) return;
      if (isInsideOverlay(e.target)) return;
      startYRef.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const startY = startYRef.current;
      if (startY === undefined || startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (window.scrollY > 0 || (dy <= 0 && phaseRef.current !== 'pulling')) {
        // 上方向のスクロールはブラウザに任せる
        startYRef.current = undefined;
        if (phaseRef.current === 'pulling') {
          changePhase('idle');
          changeDistance(0);
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
      if (phaseRef.current === 'idle') changePhase('pulling');
      changeDistance(rubberBand(Math.max(0, dy)));
    };

    const handleTouchEnd = () => {
      if (startYRef.current === undefined || startYRef.current === null) return;
      startYRef.current = undefined;
      if (phaseRef.current !== 'pulling') return;
      const next = pullPhaseAfterRelease(distanceRef.current ?? 0);
      changeDistance(0);
      if (next === 'idle') {
        changePhase('idle');
        return;
      }
      changePhase('refreshing');
      (onRefreshRef.current ?? onRefresh)()
        .catch(() => undefined)
        .then((count) => {
          setResultCount(count);
          changePhase('done');
          doneTimer = setTimeout(() => changePhase('idle'), DONE_DISPLAY_MS);
        });
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      root.style.overscrollBehaviorY = previousOverscroll;
      if (doneTimer !== undefined) clearTimeout(doneTimer);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  return {
    pullDistance,
    phase,
    isArmed: isPullArmed(pullDistance),
    resultCount,
  } as const;
};

export { PULL_TO_REFRESH_THRESHOLD };
