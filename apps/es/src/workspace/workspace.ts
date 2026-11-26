import { setAction } from '../lesson/action-bar';
import { notifyNudge, nudgeAttribute } from '../lesson/nudge';
import { createChat } from './chat';
import { clockOf, formatElapsed } from './clock';
import { hasFired, isMet, keyOf, record } from './conditions';
import { nextSignals, nudgeSpecOf } from './nudge-target';
import { emitSignal, type PanelController } from './panel';
import { mountPanel } from './panels';
import { fillTemplate, interimText, type MemoOverride, memoViews, replyGate } from './rules';
import {
  type ButtonName,
  type Condition,
  type SignalDetail,
  signalEventName,
  type SignalName,
  type TabAction,
  type TabDefinition,
  type TabKind,
  tabOfKind,
  type TimelineEvent,
  type WorkspaceScenario,
} from './scenario';
import {
  createScheduler,
  type Recurring,
  type ScheduledItem,
  type SchedulerStatus,
  tickMs,
  type WaitingItem,
} from './scheduler';
import { createTabs } from './tabs';

const typingLeadMs = 1500;
const signalDelayMs = 1200;

export const mountWorkspace = (root: HTMLElement): void => {
  const scenario = JSON.parse(root.dataset.scenario ?? 'null') as WorkspaceScenario;
  const timed = scenario.mode === 'timed';
  const firstTab = scenario.tabs.find((tab) => tab.initial !== false);
  if (firstTab === undefined) {
    throw new Error('最初から表示するタブがありません');
  }
  const selfActor = Object.entries(scenario.actors).find(([, actor]) => actor.self === true)?.[0] ?? '';
  const doneWhen: Condition | undefined = scenario.done ?? (scenario.reply === undefined ? undefined : 'chat:replied');
  const reportsDone = document.querySelector<HTMLElement>('[data-action-bar]')?.dataset.state === 'do';
  let reportedDone = false;

  const startPanel = root.querySelector<HTMLElement>('[data-start]');
  const startButton = root.querySelector<HTMLButtonElement>('[data-action="start"]');
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-action="pause"]');
  const resetButton = root.querySelector<HTMLButtonElement>('[data-action="reset"]');
  const elapsedText = root.querySelector<HTMLElement>('[data-elapsed]');
  const clockText = root.querySelector<HTMLElement>('[data-clock]');
  const affectedText = root.querySelector<HTMLElement>('[data-affected]');
  const windows = [...root.querySelectorAll<HTMLElement>('[data-window]')];

  const fired = new Map<SignalName, Set<string>>();
  const latest = new Map<SignalName, Readonly<Record<string, unknown>>>();
  const controllers = new Map<string, PanelController>();
  const compact = matchMedia('(max-width: 639px)');
  const firstView: 'chat' | 'tools' = timed ? 'chat' : 'tools';
  const state = {
    selected: firstTab.key,
    view: firstView,
    opened: [] as string[],
    forcedUnseen: new Set<string>(),
    replied: false,
    counter: scenario.status.counter?.initial ?? 0,
    unlocked: new Set<ButtonName>(),
    memoOverrides: new Map<string, MemoOverride>(),
  };
  let intervalId: number | undefined;

  const emit = (name: SignalName, data?: Readonly<Record<string, unknown>>): void => emitSignal(root, name, data);

  const chat = createChat(root, scenario);

  const recurring: Recurring[] = scenario.tabs.flatMap((tab) =>
    tab.kind === 'logs'
      ? tab.config.rules.map((rule, index) => ({
        everyMs: rule.everySeconds * 1000,
        run: (count: number) => controllers.get(tab.key)?.rule?.(index, count),
      }))
      : []
  );

  const stopInterval = (): void => {
    window.clearInterval(intervalId);
    intervalId = undefined;
  };

  const updatePanels = (): void => {
    for (const controller of controllers.values()) {
      controller.update?.({ status: scheduler.status(), elapsedMs: scheduler.elapsedMs() });
    }
  };

  const renderClock = (): void => {
    const ms = scheduler.elapsedMs();
    if (elapsedText !== null) elapsedText.textContent = formatElapsed(ms);
    if (clockText !== null) clockText.textContent = clockOf(scenario.startedAt + ms);
    if (affectedText !== null) {
      affectedText.textContent = `${state.counter}${scenario.status.counter?.unit ?? ''}`;
    }
  };

  let nudged: HTMLElement | null = null;

  const tabButtonOf = (key: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[role="tab"][data-tool="${key}"]`);

  const foldedRailOf = (element: HTMLElement): HTMLElement | null =>
    !compact.matches && element.closest('.win.chat[data-collapsed]:not([data-open])') !== null
      ? root.querySelector<HTMLElement>('[data-rail]')
      : null;

  const nudgeVisible = (element: HTMLElement | null, chatFront: boolean): HTMLElement | null => {
    if (element === null) return null;
    const panel = element.closest<HTMLElement>('[role="tabpanel"][data-tool]');
    const shown = panel !== null && (panel.dataset.tool !== state.selected || chatFront)
      ? tabButtonOf(panel.dataset.tool ?? '')
      : compact.matches && state.view === 'tools' && element.closest('.win.chat') !== null
      ? root.querySelector<HTMLElement>('[data-chat-tab]')
      : foldedRailOf(element) ?? element;
    return shown === null || shown.matches(':disabled') ? null : shown;
  };

  const nudgeElement = (status: SchedulerStatus, chatFront: boolean): HTMLElement | null => {
    if (timed && status === 'idle') return nudgeVisible(startButton, chatFront);
    if (status === 'paused') return null;
    if (doneWhen !== undefined && isMet(fired, doneWhen)) return null;
    const reply = root.querySelector<HTMLElement>('[data-action="reply"]');
    if (reply !== null && !reply.hidden && !reply.matches(':disabled') && !state.replied) {
      return nudgeVisible(reply, chatFront);
    }
    const context = { tabs: scenario.tabs, selected: chatFront ? '' : state.selected };
    for (const signal of nextSignals(fired, scenario.gates, doneWhen)) {
      const spec = nudgeSpecOf(signal, context);
      if (spec === null) continue;
      const element = nudgeVisible(
        'tab' in spec ? tabButtonOf(spec.tab) : root.querySelector<HTMLElement>(spec.selector),
        chatFront,
      );
      if (element !== null) return element;
    }
    return null;
  };

  const updateNudge = (): void => {
    const chatFront = compact.matches && state.view === 'chat';
    const next = nudgeElement(scheduler.status(), chatFront);
    if (next === nudged) return;
    nudged?.removeAttribute(nudgeAttribute);
    next?.setAttribute(nudgeAttribute, '');
    nudged = next;
    notifyNudge();
  };

  function render(): void {
    const status = scheduler.status();
    const gate = replyGate(scenario.gates, fired);
    const started = status === 'running' || status === 'paused';
    root.dataset.opened = state.opened.join(' ');
    root.dataset.selected = state.selected;
    root.dataset.view = state.view;
    const chatFront = compact.matches && state.view === 'chat';
    root.dataset.ready = String(gate.ready);
    root.dataset.phase = status === 'idle'
      ? 'idle'
      : status === 'ended'
      ? 'ended'
      : status === 'paused'
      ? 'paused'
      : state.replied
      ? 'replied'
      : 'running';
    if (startPanel !== null) startPanel.hidden = status !== 'idle';
    for (const element of windows) {
      element.inert = timed && status === 'idle';
    }
    if (pauseButton !== null) {
      pauseButton.textContent = status === 'paused' ? '再開する' : '一時停止';
      pauseButton.disabled = !started;
    }
    if (resetButton !== null) resetButton.disabled = status === 'idle';
    const unseen = new Set([
      ...scenario.tabs.flatMap((tab) => tab.seen !== undefined && !state.opened.includes(tab.key) ? [tab.key] : []),
      ...state.forcedUnseen,
    ]);
    tabs.sync({ selected: state.selected, unseen, chatFront, compact: compact.matches });
    chat.render({
      started,
      replied: state.replied,
      ready: gate.ready,
      reason: gate.reason,
      memo: scenario.memo === undefined ? [] : memoViews(scenario.memo, fired, state.memoOverrides, latest),
      answerRequested: fired.has('agent:requested'),
      unlocked: state.unlocked,
      tabbed: compact.matches,
      front: chatFront,
    });
    updatePanels();
    renderClock();
    if (reportsDone && doneWhen !== undefined) {
      const done = isMet(fired, doneWhen);
      if (done !== reportedDone) {
        reportedDone = done;
        setAction({ state: done ? 'done' : 'do' });
      }
    }
    updateNudge();
  }

  const startInterval = (): void => {
    stopInterval();
    intervalId = window.setInterval(() => scheduler.tick(), tickMs);
  };

  const scheduler = createScheduler({
    now: () => Date.now(),
    recurring,
    onStatus: (status) => {
      if (status === 'running') startInterval();
      else stopInterval();
      render();
    },
    onTick: () => {
      updatePanels();
      renderClock();
    },
  });

  const choose = (key: string): void => {
    state.forcedUnseen.delete(key);
    state.selected = key;
    state.view = 'tools';
    emit('tab:selected', { key });
  };

  const chooseChat = (): void => {
    state.view = 'chat';
    render();
  };

  const mountController = (tab: TabDefinition, panel: HTMLElement): void => {
    controllers.set(
      tab.key,
      mountPanel({
        root,
        panel,
        scenario,
        tab,
        emit: (name, data) => emitSignal(panel, name, data),
        elapsedMs: () => scheduler.elapsedMs(),
      }),
    );
  };

  const tabs = createTabs(root, { choose, chooseChat });

  const controllerOf = (kind: TabKind, key?: string): PanelController | undefined => {
    const tab = tabOfKind(scenario, kind, key);
    return tab === undefined ? undefined : controllers.get(tab.key);
  };

  const applyTab = (key: string, action: TabAction): void => {
    const definition = scenario.tabs.find((tab) => tab.key === key);
    if (definition === undefined) return;
    if (action === 'unseen') {
      state.forcedUnseen.add(key);
      render();
      return;
    }
    const panel = tabs.add(key);
    if (panel !== null) mountController(definition, panel);
    if (action === 'open') choose(key);
    else render();
  };

  const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const perform = (event: TimelineEvent, atMs: number): void => {
    switch (event.kind) {
      case 'post':
        if (event.unlessReplied === true && state.replied) {
          chat.clearTyping();
          return;
        }
        if (event.when !== undefined && !reducedMotion()) {
          const due = atMs + signalDelayMs;
          chat.setTyping(event.post.actor);
          scheduler.schedule([{ at: due, run: () => chat.addPost(event.post, due) }]);
          return;
        }
        chat.addPost(event.post, atMs);
        return;
      case 'log':
        controllerOf('logs', event.tab)?.perform?.(event, atMs);
        return;
      case 'sql':
        controllerOf('console', event.tab)?.perform?.(event, atMs);
        return;
      case 'affected':
        state.counter = event.count;
        return;
      case 'tab':
        applyTab(event.tab, event.action);
        return;
      case 'memo':
        state.memoOverrides.set(event.memo, { state: event.state, text: event.text });
        render();
        return;
      case 'enable':
        state.unlocked.add(event.button);
        render();
        return;
    }
  };

  const timedItems = (): ScheduledItem[] =>
    scenario.timeline.flatMap((event) => {
      const at = event.at;
      if (at === undefined) return [];
      const items: ScheduledItem[] = [{ at: at * 1000, run: () => perform(event, at * 1000) }];
      const typingFrom = at * 1000 - typingLeadMs;
      if (event.kind === 'post' && typingFrom > 0 && !reducedMotion()) {
        items.push({
          at: typingFrom,
          run: () => {
            if (event.unlessReplied !== true || !state.replied) chat.setTyping(event.post.actor);
          },
        });
      }
      return items;
    });

  const waitingItems = (): WaitingItem[] =>
    scenario.timeline.flatMap((event) => {
      const when = event.when;
      return when === undefined ? [] : [{ when, key: event.key, run: () => perform(event, scheduler.elapsedMs()) }];
    });

  const syncOpened = (): void => {
    for (const tab of scenario.tabs) {
      if (tab.seen !== undefined && hasFired(fired, tab.seen) && !state.opened.includes(tab.key)) {
        state.opened.push(tab.key);
      }
    }
  };

  root.addEventListener(signalEventName, (event) => {
    const detail = (event as CustomEvent<SignalDetail>).detail;
    const key = keyOf(detail.data);
    record(fired, detail.name, key);
    if (detail.data !== undefined) latest.set(detail.name, detail.data);
    syncOpened();
    scheduler.signal(detail.name, key);
    render();
  });

  const begin = (): void => {
    scheduler.start(timedItems(), waitingItems());
    if (timed) chat.focusFeed();
    if (timed && compact.matches) root.scrollIntoView({ block: 'start' });
    emit('workspace:started');
  };

  const reset = (): void => {
    scheduler.reset();
    if (timed) {
      for (const controller of controllers.values()) controller.reset?.();
      for (const tab of scenario.tabs) {
        if (tab.initial === false) controllers.delete(tab.key);
      }
      tabs.removeAdded();
      state.selected = firstTab.key;
      state.view = firstView;
      state.opened = [];
    }
    fired.clear();
    latest.clear();
    state.forcedUnseen.clear();
    state.replied = false;
    state.counter = scenario.status.counter?.initial ?? 0;
    state.unlocked.clear();
    state.memoOverrides.clear();
    chat.clear();
    chat.showHistory();
    render();
    if (timed) startButton?.focus();
    else begin();
  };

  const interimDone = (): void => {
    const interim = scenario.interim;
    if (interim === undefined || scenario.memo === undefined) return;
    scheduler.tick();
    const status = scheduler.status();
    if (status !== 'running' && status !== 'paused') return;
    const views = memoViews(scenario.memo, fired, state.memoOverrides, latest);
    chat.addPost(
      { actor: selfActor, text: interimText(interim.heading, interim.unknown, interim.pending, interim.order, views) },
      scheduler.elapsedMs(),
    );
    emit('chat:interim-sent');
  };

  const replyDone = (): void => {
    const reply = scenario.reply;
    if (reply === undefined) return;
    scheduler.tick();
    const status = scheduler.status();
    if (status !== 'running' && status !== 'paused') return;
    const at = scheduler.elapsedMs();
    chat.clearTyping();
    for (const line of reply.lines) {
      if (line.after !== undefined && at < line.after * 1000) continue;
      const text = reply.from === undefined
        ? line.text
        : fillTemplate(line.text, latest.get(reply.from.signal), reply.from.formats);
      chat.addPost({ actor: selfActor, text }, at);
    }
    state.replied = true;
    let when = at;
    let previous = at;
    scheduler.schedule(
      reply.followUps.flatMap((item, index) => {
        when += item.delay * 1000;
        const due = when;
        const typingFrom = Math.max(previous, due - typingLeadMs);
        previous = due;
        const last = index === reply.followUps.length - 1;
        const typing = (): void => chat.setTyping(item.actor);
        if (!reducedMotion() && typingFrom <= at) typing();
        return [
          ...(!reducedMotion() && typingFrom > at ? [{ at: typingFrom, run: typing }] : []),
          {
            at: due,
            run: () => {
              chat.addPost({ actor: item.actor, text: item.text }, due);
              if (last) scheduler.finish(due);
            },
          },
        ];
      }),
    );
    emit('chat:replied');
    chat.focusFeed();
  };

  chat.onAction('interim', interimDone);
  chat.onAction('reply', replyDone);
  chat.onAction('answer', () => {
    if (!fired.has('agent:requested')) emit('agent:requested');
  });
  startButton?.addEventListener('click', begin);
  pauseButton?.addEventListener(
    'click',
    () => (scheduler.status() === 'paused' ? scheduler.resume() : scheduler.pause()),
  );
  resetButton?.addEventListener('click', reset);
  compact.addEventListener('change', render);
  const main = document.querySelector<HTMLElement>('main.lesson-main');
  const statusBar = root.querySelector<HTMLElement>('.status-bar');
  const tabStrip = root.querySelector<HTMLElement>('.tab-strip');
  const measureBars = (): void => {
    if (main !== null) {
      const style = getComputedStyle(main);
      const height = main.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      root.style.setProperty('--ws-height', `${height}px`);
    }
    root.style.setProperty('--ws-top', `${statusBar?.offsetHeight ?? 0}px`);
    if (tabStrip !== null) root.style.setProperty('--ws-strip', `${tabStrip.offsetHeight}px`);
  };
  const barObserver = new ResizeObserver(measureBars);
  for (const bar of [main, statusBar, tabStrip]) {
    if (bar !== null) barObserver.observe(bar);
  }
  measureBars();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduler.tick();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && chat.isOpen()) chat.closeRail();
  });
  const questionInput = root.querySelector<HTMLTextAreaElement>('[data-own-question] textarea');
  if (questionInput !== null) {
    questionInput.placeholder = scenario.chat.placeholder;
    questionInput.addEventListener('input', () => {
      if (questionInput.value.trim() !== '') emit('question:written');
    });
  }
  root.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-open-tool]') : null;
    if (button === null) return;
    const key = button.dataset.openTool ?? '';
    choose(key);
    controllers.get(key)?.open?.();
  });

  for (const tab of scenario.tabs) {
    const panel = tab.initial === false ? undefined : tabs.panelOf(tab.key);
    if (panel !== undefined) mountController(tab, panel);
  }
  new MutationObserver(updateNudge).observe(root, {
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'hidden', 'data-open'],
  });
  render();
  if (!timed) begin();
};
