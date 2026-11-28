import {
  channelOfPost,
  type ChannelState,
  dayDividers,
  hasOpeningPost,
  openingChannel,
  openingChannelState,
  placeholderOf,
  receivePost,
  receiveTyping,
  revealChannel,
  selectChannel,
  totalUnread,
  typingVisible,
  unreadOf,
} from './channel';
import { minuteOf } from './clock';
import { cloneFirst, fillText, must } from './dom';
import type { MemoView } from './rules';
import type { ButtonName, Post, WorkspaceScenario } from './scenario';
import { firstUnreadsAfter, scrollTopToReveal } from './unread';

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
  const dayTemplate = must<HTMLTemplateElement>(root, 'template[data-day]');
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
  const channelItems = [...root.querySelectorAll<HTMLButtonElement>('button[data-channel]')];
  const placeholder = root.querySelector<HTMLElement>('[data-placeholder]');
  const questionInput = root.querySelector<HTMLTextAreaElement>('[data-own-question] textarea');
  const defaultChannel = scenario.chat.channel;
  const initialChannel = openingChannel(scenario.timeline, defaultChannel);
  const entries: { readonly post: Post; readonly element: HTMLElement }[] = [];
  const awaitsOpeningPost = hasOpeningPost(scenario.timeline);
  let awaiting = awaitsOpeningPost;
  let state = openingChannelState(initialChannel);
  let renderedChannel = initialChannel;
  let typingActor: string | null = null;
  let typingChannel = initialChannel;
  let firsts: ReadonlyMap<string, HTMLElement> = new Map();
  let open = false;
  let tabbed = false;
  let front = false;

  const visible = (): boolean => (tabbed ? front : rail === null || open);

  const renderEmpty = (): void => {
    feed.toggleAttribute('data-empty', feed.childElementCount === 0 && !awaiting);
  };

  const dividerOf = (label: string): HTMLElement => {
    const divider = cloneFirst(dayTemplate, 'li');
    fillText(divider, '[data-day-label]', label);
    return divider;
  };

  const shownEntries = (): typeof entries =>
    entries.filter((entry) => channelOfPost(entry.post, defaultChannel) === state.channel);

  const layoutFeed = (): void => {
    const shown = shownEntries();
    const dividers = dayDividers(shown.map((entry) => entry.post));
    let previous: string | null = null;
    const elements: HTMLElement[] = [];
    shown.forEach((entry, index) => {
      const label = dividers[index] ?? null;
      if (label !== null) {
        elements.push(dividerOf(label));
        previous = null;
      }
      entry.element.classList.toggle('is-continued', previous === entry.post.actor);
      previous = entry.post.actor;
      elements.push(entry.element);
    });
    feed.replaceChildren(...elements);
    renderEmpty();
    feed.scrollTop = feed.scrollHeight;
  };

  const renderPlaceholder = (): void => {
    const text = placeholderOf(state.channel, defaultChannel, scenario.chat.placeholder);
    if (placeholder !== null) placeholder.textContent = text;
    if (questionInput !== null) questionInput.placeholder = text;
  };

  const renderChannels = (): void => {
    for (const item of channelItems) {
      const name = item.dataset.channel ?? '';
      const count = unreadOf(state, name);
      if (name === state.channel) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
      if (count > 0) item.dataset.channelUnread = String(count);
      else delete item.dataset.channelUnread;
      const countCell = item.querySelector<HTMLElement>('[data-channel-count]');
      if (countCell !== null) {
        countCell.hidden = count === 0;
        countCell.textContent = String(count);
      }
      const label = item.querySelector<HTMLElement>('[data-channel-label]');
      if (label !== null) label.textContent = count > 0 ? `（未読 ${count} 件）` : '';
    }
  };

  const renderTyping = (): void => {
    typing?.toggleAttribute('data-active', typingActor !== null && typingVisible(state, typingChannel));
  };

  const renderRail = (): void => {
    const unread = totalUnread(state);
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

  const syncChannel = (): void => {
    if (state.channel !== renderedChannel) {
      renderedChannel = state.channel;
      if (channelTitle !== null) channelTitle.textContent = state.channel;
      renderPlaceholder();
      layoutFeed();
    }
    renderChannels();
    renderTyping();
    renderRail();
  };

  const apply = (next: ChannelState): void => {
    state = next;
    firsts = firstUnreadsAfter(firsts, state.unread, null);
    syncChannel();
  };

  const setTyping = (post: Pick<Post, 'actor' | 'channel'>): void => {
    typingChannel = channelOfPost(post, defaultChannel);
    typingActor = post.actor;
    if (typingText !== null) typingText.textContent = `${scenario.actors[post.actor]?.name ?? post.actor} が入力中…`;
    apply(receiveTyping(state, typingChannel, visible()));
  };

  const clearTyping = (): void => {
    typingActor = null;
    renderTyping();
  };

  const reveal = (next: ChannelState, toEnd: boolean): void => {
    const target = firsts.get(next.channel);
    apply(next);
    feed.scrollTop = scrollTopToReveal({
      scrollTop: feed.scrollTop,
      feedTop: feed.getBoundingClientRect().top,
      paddingTop: parseFloat(getComputedStyle(feed).paddingTop),
      targetTop: target?.isConnected === true ? target.getBoundingClientRect().top : null,
      scrollHeight: feed.scrollHeight,
      toEnd,
    });
  };

  const setOpen = (next: boolean): void => {
    open = next;
    renderRail();
    if (open) {
      reveal(revealChannel(state), false);
      feed.focus({ preventScroll: true });
    }
  };

  const closeRail = (): boolean => {
    if (!open) return false;
    setOpen(false);
    rail?.focus();
    return true;
  };

  for (const item of channelItems) {
    item.addEventListener('click', () => {
      reveal(selectChannel(state, item.dataset.channel ?? ''), false);
    });
  }

  rail?.addEventListener('click', () => {
    if (open) closeRail();
    else setOpen(true);
  });

  const append = (post: Post, atMs: number): HTMLElement => {
    const copy = cloneFirst(postTemplate, 'li');
    const actor = scenario.actors[post.actor];
    const shown = channelOfPost(post, defaultChannel) === state.channel;
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
      const label = dayDividers(shownEntries().map((entry) => entry.post)).at(-1) ?? null;
      if (label !== null) {
        copy.classList.remove('is-continued');
        feed.append(dividerOf(label));
      }
      feed.append(copy);
      renderEmpty();
      feed.scrollTop = feed.scrollHeight;
    }
    if (typingActor === post.actor) clearTyping();
    return copy;
  };

  const addPost = (post: Post, atMs: number): void => {
    awaiting = false;
    const channel = channelOfPost(post, defaultChannel);
    apply(receivePost(state, { channel, self: scenario.actors[post.actor]?.self === true }, visible()));
    const element = append(post, atMs);
    firsts = firstUnreadsAfter(firsts, state.unread, { channel, post: element });
  };

  const showHistory = (): void => {
    for (const post of scenario.history) append(post, 0);
  };

  const render = (view: ChatView): void => {
    if (view.tabbed !== tabbed || view.front !== front) {
      tabbed = view.tabbed;
      front = view.front;
      if (tabbed) open = false;
      if (visible()) reveal(revealChannel(state), true);
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
  renderEmpty();

  return {
    addPost,
    showHistory,
    clear: () => {
      entries.splice(0);
      awaiting = awaitsOpeningPost;
      apply(openingChannelState(initialChannel));
      feed.replaceChildren();
      renderEmpty();
      clearTyping();
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
