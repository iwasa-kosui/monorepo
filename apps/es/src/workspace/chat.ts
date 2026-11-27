import { channelOfPost, openingChannel, placeholderOf, postsInChannel } from './channel';
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
  readonly tabbed: boolean;
  readonly front: boolean;
};

export type Chat = {
  readonly addPost: (post: Post, atMs: number) => void;
  readonly showHistory: () => void;
  readonly clear: () => void;
  readonly setTyping: (post: Pick<Post, 'actor' | 'channel'>) => void;
  readonly clearTyping: () => void;
  readonly isOpen: () => boolean;
  readonly closeRail: () => boolean;
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
  const chatWindow = root.querySelector<HTMLElement>('.win.chat');
  const rail = root.querySelector<HTMLButtonElement>('[data-rail]');
  const badge = root.querySelector<HTMLElement>('[data-unread]');
  const tabBadge = root.querySelector<HTMLElement>('[data-chat-unread]');
  const tabBadgeLabel = root.querySelector<HTMLElement>('[data-chat-unread-label]');
  const typing = root.querySelector<HTMLElement>('[data-typing]');
  const typingText = root.querySelector<HTMLElement>('[data-typing-text]');
  const channelTitle = root.querySelector<HTMLElement>('[data-channel-title]');
  const channelItems = [...root.querySelectorAll<HTMLElement>('[data-channel]')];
  const placeholder = root.querySelector<HTMLElement>('[data-placeholder]');
  const questionInput = root.querySelector<HTMLTextAreaElement>('[data-own-question] textarea');
  const defaultChannel = scenario.chat.channel;
  const initialChannel = openingChannel(scenario.timeline, defaultChannel);
  const entries: { readonly post: Post; readonly element: HTMLElement }[] = [];
  let channel = initialChannel;
  let typingActor: string | null = null;
  let unread = 0;
  let open = false;
  let tabbed = false;
  let front = false;

  const visible = (): boolean => (tabbed ? front : rail === null || open);

  const layoutFeed = (): void => {
    const shown = new Set(postsInChannel(entries.map((entry) => entry.post), channel, defaultChannel));
    let previous: string | null = null;
    const elements: HTMLElement[] = [];
    for (const entry of entries) {
      if (!shown.has(entry.post)) continue;
      entry.element.classList.toggle('is-continued', previous === entry.post.actor);
      previous = entry.post.actor;
      elements.push(entry.element);
    }
    feed.replaceChildren(...elements);
    feed.scrollTop = feed.scrollHeight;
  };

  const renderPlaceholder = (): void => {
    const text = placeholderOf(channel, defaultChannel, scenario.chat.placeholder);
    if (placeholder !== null) placeholder.textContent = text;
    if (questionInput !== null) questionInput.placeholder = text;
  };

  const showChannel = (next: string): void => {
    if (next === channel) return;
    channel = next;
    if (channelTitle !== null) channelTitle.textContent = channel;
    for (const item of channelItems) item.classList.toggle('on', item.dataset.channel === channel);
    renderPlaceholder();
    layoutFeed();
  };

  const setTyping = (post: Pick<Post, 'actor' | 'channel'>): void => {
    showChannel(channelOfPost(post, defaultChannel));
    typingActor = post.actor;
    if (typingText !== null) typingText.textContent = `${scenario.actors[post.actor]?.name ?? post.actor} が入力中…`;
    typing?.setAttribute('data-active', '');
  };

  const clearTyping = (): void => {
    typingActor = null;
    typing?.removeAttribute('data-active');
  };

  const renderRail = (): void => {
    if (tabBadge !== null) {
      tabBadge.hidden = unread === 0;
      tabBadge.textContent = String(unread);
    }
    if (tabBadgeLabel !== null) tabBadgeLabel.textContent = unread > 0 ? `（未読 ${unread} 件）` : '';
    if (rail === null || chatWindow === null) return;
    chatWindow.toggleAttribute('data-open', open);
    rail.setAttribute('aria-expanded', String(open));
    rail.setAttribute('aria-label', unread > 0 ? `チャット（未読 ${unread} 件）` : 'チャット');
    if (badge !== null) {
      badge.hidden = unread === 0;
      badge.textContent = String(unread);
    }
  };

  const setOpen = (next: boolean): void => {
    open = next;
    if (open) unread = 0;
    renderRail();
    if (open) feed.focus({ preventScroll: true });
  };

  const closeRail = (): boolean => {
    if (!open) return false;
    setOpen(false);
    rail?.focus();
    return true;
  };

  rail?.addEventListener('click', () => {
    if (open) closeRail();
    else setOpen(true);
  });

  const append = (post: Post, atMs: number, counted: boolean): void => {
    const copy = cloneFirst(postTemplate, 'li');
    const actor = scenario.actors[post.actor];
    const shown = channelOfPost(post, defaultChannel) === channel;
    copy.classList.toggle('is-continued', (feed.lastElementChild as HTMLElement | null)?.dataset.actor === post.actor);
    copy.dataset.actor = post.actor;
    copy.classList.toggle('is-you', actor?.self === true);
    copy.dataset.tone = actor?.tone ?? 'slate';
    fillText(copy, '[data-avatar]', actor?.avatar ?? '');
    fillText(copy, '[data-name]', actor?.name ?? post.actor);
    fillText(copy, '[data-time]', post.time ?? minuteOf(scenario.startedAt + atMs));
    fillText(copy, '[data-text]', post.text);
    const list = copy.querySelector<HTMLElement>('[data-list]');
    if (list !== null && post.list !== undefined && post.list.length > 0) {
      list.hidden = false;
      list.replaceChildren(
        ...post.list.map((item) => {
          const row = document.createElement('li');
          row.textContent = item;
          return row;
        }),
      );
    }
    entries.push({ post, element: copy });
    if (shown) {
      feed.append(copy);
      feed.scrollTop = feed.scrollHeight;
    }
    if (typingActor === post.actor) clearTyping();
    if (counted && shown && !visible() && actor?.self !== true) {
      unread += 1;
      renderRail();
    }
  };

  const addPost = (post: Post, atMs: number): void => {
    showChannel(channelOfPost(post, defaultChannel));
    append(post, atMs, true);
  };

  const showHistory = (): void => {
    for (const post of scenario.history) append(post, 0, false);
  };

  const render = (view: ChatView): void => {
    if (view.tabbed !== tabbed || view.front !== front) {
      tabbed = view.tabbed;
      front = view.front;
      if (tabbed) open = false;
      if (visible()) {
        unread = 0;
        feed.scrollTop = feed.scrollHeight;
      }
      renderRail();
    }
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

  renderPlaceholder();
  showHistory();

  return {
    addPost,
    showHistory,
    clear: () => {
      entries.splice(0);
      showChannel(initialChannel);
      feed.replaceChildren();
      clearTyping();
      unread = 0;
      renderRail();
    },
    setTyping,
    clearTyping,
    isOpen: () => open,
    closeRail,
    focusFeed: () => feed.focus({ preventScroll: true }),
    onAction: (name, handler) => buttonOf(name)?.addEventListener('click', handler),
    render,
  };
};
