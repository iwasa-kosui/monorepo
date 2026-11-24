import { minuteOf } from './clock';
import { cloneFirst, fillText, must } from './dom';
import type { MemoView } from './rules';
import type { ButtonName, Post, WorkspaceScenario } from './scenario';

export type ChatView = {
  readonly started: boolean;
  readonly replied: boolean;
  readonly ready: boolean;
  readonly reason: string;
  readonly memo: readonly MemoView[];
  readonly answerRequested: boolean;
  readonly unlocked: ReadonlySet<ButtonName>;
};

export type Chat = {
  readonly addPost: (post: Post, atMs: number) => void;
  readonly showHistory: () => void;
  readonly clear: () => void;
  readonly focusFeed: () => void;
  readonly onAction: (name: ButtonName, handler: () => void) => void;
  readonly render: (view: ChatView) => void;
};

export const createChat = (root: HTMLElement, scenario: WorkspaceScenario): Chat => {
  const feed = must<HTMLElement>(root, '[data-feed]');
  const postTemplate = must<HTMLTemplateElement>(root, 'template[data-post]');
  const reason = root.querySelector<HTMLElement>('[data-reason]');
  const memoCells = [...root.querySelectorAll<HTMLElement>('[data-memo]')];
  const buttonOf = (name: ButtonName): HTMLButtonElement | null =>
    root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
  const locked = new Set(scenario.chat.buttons.flatMap((button) => (button.locked === true ? [button.name] : [])));

  const addPost = (post: Post, atMs: number): void => {
    const copy = cloneFirst(postTemplate, 'li');
    const actor = scenario.actors[post.actor];
    copy.classList.toggle('is-you', actor?.self === true);
    copy.dataset.tone = actor?.tone ?? 'slate';
    fillText(copy, '[data-avatar]', actor?.avatar ?? '');
    fillText(copy, '[data-name]', actor?.name ?? post.actor);
    fillText(copy, '[data-time]', post.time ?? minuteOf(scenario.startedAt + atMs));
    fillText(copy, '[data-text]', post.text);
    feed.append(copy);
    feed.scrollTop = feed.scrollHeight;
  };

  const showHistory = (): void => {
    for (const post of scenario.history) addPost(post, 0);
  };

  const render = (view: ChatView): void => {
    const disabled = (name: ButtonName, base: boolean): boolean =>
      base || (locked.has(name) && !view.unlocked.has(name));
    const interim = buttonOf('interim');
    if (interim !== null) interim.disabled = disabled('interim', !view.started || view.replied);
    const answer = buttonOf('answer');
    if (answer !== null) answer.disabled = disabled('answer', view.answerRequested);
    const reply = buttonOf('reply');
    if (reply !== null) {
      reply.disabled = disabled('reply', !view.ready || !view.started);
      reply.hidden = view.replied;
    }
    if (reason !== null) {
      reason.hidden = view.ready || view.replied;
      reason.textContent = view.reason;
    }
    for (const cell of memoCells) {
      const item = view.memo.find((memo) => memo.key === cell.dataset.memo);
      if (item === undefined) continue;
      cell.dataset.state = item.state;
      cell.textContent = item.text;
    }
  };

  showHistory();

  return {
    addPost,
    showHistory,
    clear: () => feed.replaceChildren(),
    focusFeed: () => feed.focus({ preventScroll: true }),
    onAction: (name, handler) => buttonOf(name)?.addEventListener('click', handler),
    render,
  };
};
