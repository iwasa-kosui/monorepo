const NEAR_END_THRESHOLD_PX = 10;

export const isNearScrollEnd = (
  scrollY: number,
  innerHeight: number,
  scrollHeight: number,
): boolean => scrollY + innerHeight >= scrollHeight - NEAR_END_THRESHOLD_PX;

export const shouldLoadNow = (
  cursor: string | undefined,
  isNearEnd: boolean,
): boolean => cursor !== undefined && isNearEnd;

export const shouldAutoLoadCursor = (
  cursor: string | undefined,
  lastAutoLoadedCursor: string | undefined,
): boolean => cursor !== undefined && cursor !== lastAutoLoadedCursor;

export const isNearDocumentEnd = (): boolean =>
  isNearScrollEnd(
    window.scrollY,
    window.innerHeight,
    Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
  );
