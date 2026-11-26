import { ACTION_EVENT } from './action-bar';
import { continueStall, isStalled, NUDGE_EVENT, nudgeAttribute, placeArrow, type Stall, startStall } from './nudge';

const svgNamespace = 'http://www.w3.org/2000/svg';
const arrowShape = 'M9 3h6v9h5l-8 9-8-9h5z';
const pollMs = 1000;

const bar = document.querySelector<HTMLElement>('[data-action-bar]');

if (bar !== null && bar.dataset.state !== 'listen') {
  const next = bar.querySelector<HTMLElement>('[data-action-next]');
  const slot = bar.querySelector<HTMLElement>('[data-action-slot]');

  const arrow = document.createElement('div');
  arrow.className = 'nudge-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.dataset.direction = 'down';
  arrow.dataset.visible = 'false';
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const shape = document.createElementNS(svgNamespace, 'path');
  shape.setAttribute('d', arrowShape);
  svg.append(shape);
  arrow.append(svg);
  document.body.append(arrow);

  const stateOf = (): string => bar.dataset.state ?? '';

  const targetOf = (): HTMLElement | null => {
    if (stateOf() === 'done') return next;
    const button = slot?.querySelector<HTMLElement>('button');
    if (button !== null && button !== undefined) return button;
    return document.querySelector<HTMLElement>(`[${nudgeAttribute}]`);
  };

  const isUsable = (target: HTMLElement): boolean =>
    target.isConnected && target.getClientRects().length > 0 && !target.matches(':disabled');

  let stall: Stall<HTMLElement> = startStall(targetOf(), stateOf(), Date.now());

  const place = (target: HTMLElement): void => {
    const size = arrow.getBoundingClientRect();
    const placement = placeArrow(
      target.getBoundingClientRect(),
      { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      { width: size.width, height: size.height },
    );
    arrow.dataset.direction = placement.direction;
    arrow.style.left = `${placement.left}px`;
    arrow.style.top = `${placement.top}px`;
  };

  const update = (): void => {
    const now = Date.now();
    const target = targetOf();
    stall = continueStall(stall, target, stateOf(), now);
    if (target !== null && isStalled(stall, now) && isUsable(target)) {
      place(target);
      arrow.dataset.visible = 'true';
    } else {
      arrow.dataset.visible = 'false';
    }
  };

  const restart = (event: Event): void => {
    const target = stall.target;
    if (target === null || !(event.target instanceof Node) || !target.contains(event.target)) return;
    stall = startStall(target, stall.state, Date.now());
    arrow.dataset.visible = 'false';
  };

  let frame = 0;
  const updateOnFrame = (): void => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  };

  document.addEventListener('click', restart, true);
  document.addEventListener('focusin', restart, true);
  document.addEventListener(NUDGE_EVENT, update);
  document.addEventListener(ACTION_EVENT, update);
  window.addEventListener('scroll', updateOnFrame, { capture: true, passive: true });
  window.addEventListener('resize', updateOnFrame);
  window.setInterval(update, pollMs);
}
