export type ActionState = 'listen' | 'do' | 'done';

export type ActionButton = {
  readonly label: string;
  readonly onClick: () => void;
};

export type ActionDetail = {
  readonly state?: ActionState;
  readonly text?: string;
  readonly button?: ActionButton | null;
};

export type ActionView = {
  readonly state: ActionState;
  readonly text: string;
  readonly button: ActionButton | null;
};

export const ACTION_EVENT = 'lesson:action';

export const actionChipLabels: Readonly<Record<ActionState, string>> = {
  listen: '聞く',
  do: '手を動かす',
  done: 'できました',
};

export const showsNext = (state: ActionState): boolean => state !== 'do';

export const applyAction = (view: ActionView, detail: ActionDetail): ActionView => ({
  state: detail.state ?? view.state,
  text: detail.text ?? view.text,
  button: detail.button === undefined ? view.button : detail.button,
});

let held: ActionDetail | null = null;

export const heldAction = (): ActionDetail | null => held;

export const setAction = (detail: ActionDetail): void => {
  held = {
    state: detail.state ?? held?.state,
    text: detail.text ?? held?.text,
    button: detail.button === undefined ? held?.button : detail.button,
  };
  const dispatch = (): void => {
    document.dispatchEvent(new CustomEvent<ActionDetail>(ACTION_EVENT, { detail }));
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dispatch, { once: true });
  } else {
    dispatch();
  }
};
