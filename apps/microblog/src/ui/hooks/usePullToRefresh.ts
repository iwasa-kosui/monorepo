import { useEffect, useRef, useState } from 'hono/jsx';

const PULL_THRESHOLD = 60;

export type UsePullToRefreshReturn = Readonly<{
  pullDistance: number;
  isPulling: boolean;
}>;

type UsePullToRefreshProps = Readonly<{
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
}>;

export const usePullToRefresh = ({
  onRefresh,
  isRefreshing,
}: UsePullToRefreshProps): UsePullToRefreshReturn => {
  const [pullDistance, setPullDistance] = useState(0);
  const isPullingRef = useRef(false);
  const touchStartY = useRef<number>(0);
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(isRefreshing);

  isRefreshingRef.current = isRefreshing;

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        touchStartY.current = e.touches[0].clientY;
        isPullingRef.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isRefreshingRef.current) return;
      if (window.scrollY > 0) {
        isPullingRef.current = false;
        setPullDistance(0);
        pullDistanceRef.current = 0;
        return;
      }

      const currentY = e.touches[0].clientY;
      const startY = touchStartY.current ?? 0;
      const distance = Math.max(0, (currentY - startY) * 0.7);
      const clampedDistance = Math.min(distance, PULL_THRESHOLD * 1.5);
      setPullDistance(clampedDistance);
      pullDistanceRef.current = clampedDistance;
    };

    const handleTouchEnd = () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;

      if (
        (pullDistanceRef.current ?? 0) >= PULL_THRESHOLD
        && !isRefreshingRef.current
      ) {
        onRefresh();
      }
      setPullDistance(0);
      pullDistanceRef.current = 0;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onRefresh]);

  return {
    pullDistance,
    isPulling: isPullingRef.current ?? false,
  } as const;
};

export const PULL_TO_REFRESH_THRESHOLD = PULL_THRESHOLD;
