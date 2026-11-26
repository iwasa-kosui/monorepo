import { ACTION_EVENT } from './action-bar';
import {
  continueStall,
  frameSizeOf,
  isStalled,
  NUDGE_EVENT,
  nudgeAttribute,
  type NudgeKind,
  nudgeLabelOf,
  nudgeMessageOf,
  placeArrow,
  type Stall,
  startStall,
} from './nudge';

const svgNamespace = 'http://www.w3.org/2000/svg';
const arrowFill = 'M9 0h6v12h5l-8 9-8-9h5z';
const arrowEdge = 'M9 0v12H4l8 9 8-9h-5V0';
const pollMs = 1000;
const textInputTypes = new Set(['text', 'search', 'email', 'url', 'tel', 'number', 'password']);
const decorativeSelector = '[hidden], [aria-hidden="true"], .cfig-sr, .visually-hidden, [data-unseen]';

const bar = document.querySelector<HTMLElement>('[data-action-bar]');

if (bar !== null && bar.dataset.state !== 'listen') {
  const next = bar.querySelector<HTMLElement>('[data-action-next]');
  const slot = bar.querySelector<HTMLElement>('[data-action-slot]');

  const outer = document.createElement('div');
  outer.className = 'nudge';
  outer.dataset.direction = 'down';
  outer.dataset.visible = 'false';
  const bubble = document.createElement('p');
  bubble.className = 'nudge__bubble';
  bubble.setAttribute('role', 'status');
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('class', 'nudge__arrow');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const edge = document.createElementNS(svgNamespace, 'path');
  edge.setAttribute('class', 'nudge__arrow-edge');
  edge.setAttribute('d', arrowEdge);
  const fill = document.createElementNS(svgNamespace, 'path');
  fill.setAttribute('class', 'nudge__arrow-fill');
  fill.setAttribute('d', arrowFill);
  svg.append(edge, fill);
  outer.append(bubble, svg);
  document.body.append(outer);

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

  const kindOf = (target: HTMLElement): NudgeKind => {
    if (target.getAttribute('role') === 'tab') return 'tab';
    if (
      target instanceof HTMLTextAreaElement
      || (target instanceof HTMLInputElement && textInputTypes.has(target.type))
    ) return 'input';
    return 'press';
  };

  const messageOf = (target: HTMLElement): string => {
    const copy = target.cloneNode(true) as HTMLElement;
    for (const decoration of copy.querySelectorAll(decorativeSelector)) decoration.remove();
    const label = nudgeLabelOf(
      copy.textContent ?? '',
      target.getAttribute('aria-label'),
      target.getAttribute('data-nudge-label'),
    );
    return nudgeMessageOf(kindOf(target), label);
  };

  const place = (target: HTMLElement): void => {
    const message = messageOf(target);
    if (bubble.textContent !== message) bubble.textContent = message;
    bubble.hidden = message === '';
    const bubbleBox = bubble.getBoundingClientRect();
    const arrowBox = svg.getBoundingClientRect();
    const bubbleSize = { width: bubbleBox.width, height: bubbleBox.height };
    const arrowSize = { width: arrowBox.width, height: arrowBox.height };
    const placement = placeArrow(
      target.getBoundingClientRect(),
      { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      (direction) => frameSizeOf(direction, bubbleSize, arrowSize),
      Math.max(arrowSize.width, arrowSize.height) / 2,
      bar.contains(target) ? [] : [bar.getBoundingClientRect()],
    );
    outer.dataset.direction = placement.direction;
    outer.style.left = `${placement.left}px`;
    outer.style.top = `${placement.top}px`;
    outer.style.setProperty('--nudge-arrow-offset', `${placement.arrowOffset}px`);
  };

  const update = (): void => {
    const now = Date.now();
    const target = targetOf();
    stall = continueStall(stall, target, stateOf(), now);
    if (target !== null && isStalled(stall, now) && isUsable(target)) {
      place(target);
      outer.dataset.visible = 'true';
    } else {
      outer.dataset.visible = 'false';
      bubble.textContent = '';
    }
  };

  const restart = (event: Event): void => {
    const target = stall.target;
    if (target === null || !(event.target instanceof Node) || !target.contains(event.target)) return;
    stall = startStall(target, stall.state, Date.now());
    outer.dataset.visible = 'false';
    bubble.textContent = '';
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
