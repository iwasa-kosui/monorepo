export const NUDGE_EVENT = 'lesson:nudge';

export const nudgeAttribute = 'data-nudge-target';

// 動作確認のための暫定値。本番の前に 20_000 に戻す
export const stallMs = 5_000;

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
  readonly arrowOffset: number;
};

export type NudgeKind = 'tab' | 'input' | 'press';

const normalize = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim();

export const nudgeLabelOf = (text: string, ariaLabel: string | null, nudgeLabel: string | null = null): string => {
  const named = normalize(nudgeLabel);
  if (named !== '') return named;
  const shown = normalize(text);
  return shown === '' ? normalize(ariaLabel) : shown;
};

export const nudgeMessageOf = (kind: NudgeKind, label: string): string => {
  if (kind === 'input') return 'この欄に入力します';
  if (label === '') return '';
  return kind === 'tab' ? `「${label}」のタブを開きます` : `「${label}」を押します`;
};

export const frameSizeOf = (direction: Direction, bubble: Size, arrow: Size): Size =>
  direction === 'up' || direction === 'down'
    ? { width: Math.max(bubble.width, arrow.width), height: bubble.height + arrow.height }
    : { width: bubble.width + arrow.width, height: Math.max(bubble.height, arrow.height) };

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

const offsetWithin = (center: number, start: number, length: number, inset: number): number =>
  length < inset * 2 ? length / 2 : clamp(center - start, inset, length - inset);

export const placeArrow = (
  target: Box,
  viewport: Size,
  sizeOf: (direction: Direction) => Size,
  inset = 0,
  avoid: readonly Box[] = [],
): Placement => {
  const visibleLeft = Math.max(target.left, 0);
  const visibleRight = Math.min(target.right, viewport.width);
  const visibleTop = Math.max(target.top, 0);
  const visibleBottom = Math.min(target.bottom, viewport.height);
  const centerX = (visibleLeft + visibleRight) / 2;
  const centerY = (visibleTop + visibleBottom) / 2;
  const horizontal = (direction: Direction, left: number, top: number): Placement => {
    const size = sizeOf(direction);
    const placed = clamp(left, 0, viewport.width - size.width);
    return { direction, left: placed, top, arrowOffset: offsetWithin(centerX, placed, size.width, inset) };
  };
  const vertical = (direction: Direction, left: number, top: number): Placement => {
    const size = sizeOf(direction);
    const placed = clamp(top, 0, viewport.height - size.height);
    return { direction, left, top: placed, arrowOffset: offsetWithin(centerY, placed, size.height, inset) };
  };

  if (target.bottom <= 0) {
    const size = sizeOf('up');
    return horizontal('up', clamp(centerX - size.width / 2, 0, viewport.width - size.width), 0);
  }
  if (target.top >= viewport.height) {
    const size = sizeOf('down');
    return horizontal(
      'down',
      clamp(centerX - size.width / 2, 0, viewport.width - size.width),
      viewport.height - size.height,
    );
  }

  const down = sizeOf('down');
  const right = sizeOf('right');
  const up = sizeOf('up');
  const left = sizeOf('left');
  const above = horizontal('down', centerX - down.width / 2, target.top - down.height);
  const candidates: readonly Placement[] = [
    above,
    horizontal('up', centerX - up.width / 2, target.bottom),
    vertical('right', target.left - right.width, centerY - right.height / 2),
    vertical('left', target.right, centerY - left.height / 2),
  ];
  const fits = (placement: Placement): boolean => {
    const size = sizeOf(placement.direction);
    return placement.left >= 0
      && placement.top >= 0
      && placement.left + size.width <= viewport.width
      && placement.top + size.height <= viewport.height
      && !avoid.some((area) =>
        placement.left < area.right
        && placement.left + size.width > area.left
        && placement.top < area.bottom
        && placement.top + size.height > area.top
      );
  };
  const fitting = candidates.find(fits);
  if (fitting !== undefined) return fitting;
  return horizontal(
    above.direction,
    clamp(above.left, 0, viewport.width - down.width),
    clamp(above.top, 0, viewport.height - down.height),
  );
};
