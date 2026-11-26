import {
  ACTION_EVENT,
  type ActionButton,
  actionChipLabels,
  type ActionDetail,
  type ActionState,
  type ActionView,
  applyAction,
  heldAction,
  showsNext,
} from './action-bar';

const isState = (value: string | undefined): value is ActionState =>
  value === 'listen' || value === 'do' || value === 'done';

const bar = document.querySelector<HTMLElement>('[data-action-bar]');

if (bar !== null) {
  const chip = bar.querySelector<HTMLElement>('[data-action-chip]');
  const text = bar.querySelector<HTMLElement>('[data-action-text]');
  const slot = bar.querySelector<HTMLElement>('[data-action-slot]');
  const next = bar.querySelector<HTMLElement>('[data-action-next]');
  const initial = bar.dataset.state;

  let view: ActionView = {
    state: isState(initial) ? initial : 'listen',
    text: text?.textContent ?? '',
    button: null,
  };

  const placeButton = (button: ActionButton | null): void => {
    if (slot === null) return;
    slot.replaceChildren();
    if (button === null) return;
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'btn btn--bar';
    element.textContent = button.label;
    element.addEventListener('click', button.onClick);
    slot.append(element);
  };

  const render = (detail: ActionDetail): void => {
    const previous = view;
    view = applyAction(previous, detail);
    bar.dataset.state = view.state;
    if (chip !== null) chip.textContent = actionChipLabels[view.state];
    if (text !== null && view.text !== previous.text) text.textContent = view.text;
    if (view.button !== previous.button) placeButton(view.button);
    if (next !== null) {
      next.hidden = !showsNext(view.state);
      next.classList.toggle('btn--outline', view.state === 'listen');
      next.classList.toggle('btn--bar', view.state !== 'listen');
    }
  };

  document.addEventListener(ACTION_EVENT, (event) => {
    if (event instanceof CustomEvent) render(event.detail as ActionDetail);
  });

  const held = heldAction();
  if (held !== null) render(held);
}
