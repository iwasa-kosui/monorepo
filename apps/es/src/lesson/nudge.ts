export const NUDGE_EVENT = 'lesson:nudge';

export const nudgeAttribute = 'data-nudge-target';

export const stallMs = 60_000;

export type Stall<T> = {
  readonly target: T | null;
  readonly state: string;
  readonly since: number;
};

export const startStall = <T>(target: T | null, state: string, now: number): Stall<T> => ({
  target,
  state,
  since: now,
});

export const continueStall = <T>(current: Stall<T>, target: T | null, state: string, now: number): Stall<T> =>
  current.target === target && current.state === state ? current : startStall(target, state, now);

export const isStalled = (stall: Stall<unknown>, now: number): boolean =>
  stall.target !== null && now - stall.since >= stallMs;

export const notifyNudge = (): void => {
  document.dispatchEvent(new CustomEvent(NUDGE_EVENT));
};

export type Box = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

export type Size = { readonly width: number; readonly height: number };

export type Direction = 'up' | 'down' | 'left' | 'right';

export type Placement = {
  readonly direction: Direction;
  readonly left: number;
  readonly top: number;
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

export const placeArrow = (target: Box, viewport: Size, arrow: Size): Placement => {
  const visibleLeft = Math.max(target.left, 0);
  const visibleRight = Math.min(target.right, viewport.width);
  const visibleTop = Math.max(target.top, 0);
  const visibleBottom = Math.min(target.bottom, viewport.height);
  const centerX = (visibleLeft + visibleRight) / 2;
  const centerY = (visibleTop + visibleBottom) / 2;
  const alongX = clamp(centerX - arrow.width / 2, 0, viewport.width - arrow.width);

  if (target.bottom <= 0) return { direction: 'up', left: alongX, top: 0 };
  if (target.top >= viewport.height) return { direction: 'down', left: alongX, top: viewport.height - arrow.height };

  const above: Placement = { direction: 'down', left: centerX - arrow.width / 2, top: target.top - arrow.height };
  const candidates: readonly Placement[] = [
    above,
    { direction: 'right', left: target.left - arrow.width, top: centerY - arrow.height / 2 },
    { direction: 'up', left: centerX - arrow.width / 2, top: target.bottom },
    { direction: 'left', left: target.right, top: centerY - arrow.height / 2 },
  ];
  const fits = (placement: Placement): boolean =>
    placement.left >= 0
    && placement.top >= 0
    && placement.left + arrow.width <= viewport.width
    && placement.top + arrow.height <= viewport.height;
  const fitting = candidates.find(fits);
  if (fitting !== undefined) return fitting;
  return {
    direction: above.direction,
    left: clamp(above.left, 0, viewport.width - arrow.width),
    top: clamp(above.top, 0, viewport.height - arrow.height),
  };
};
