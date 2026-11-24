import { minuteOf } from '../clock';
import { cloneFirst, must } from '../dom';
import { describeLog } from '../log-format';
import { chartOf, facetValue, minuteMs, rowsMatchingFacets, rowsMatchingQuery, type SearchRow } from '../log-search';
import type { PanelMount } from '../panel';
import type { LogEntry } from '../scenario';

type LogRow = SearchRow & {
  readonly element: HTMLTableRowElement;
  readonly target: boolean;
  readonly date: string;
  readonly content: string;
  readonly dynamic: boolean;
};

const maxDynamicRows = 600;

export const mountLogExplorer: PanelMount<'logs'> = (host) => {
  const { panel } = host;
  const config = host.tab.config;
  const scope = { service: config.service, host: config.host };
  const startedAt = host.scenario.startedAt;

  const rowTemplate = must<HTMLTemplateElement>(panel, 'template[data-log-row-template]');
  const query = must<HTMLInputElement>(panel, '[data-query]');
  const logCount = must<HTMLElement>(panel, '[data-log-count]');
  const logEmpty = must<HTMLElement>(panel, '[data-empty]');
  const logBody = must<HTMLElement>(panel, '[data-log-body]');
  const chart = must<HTMLElement>(panel, '[data-chart]');
  const bars = [...chart.querySelectorAll<HTMLElement>('.bar')];
  const axes = [...chart.querySelectorAll<HTMLElement>('[data-tick]')];
  const facetInputs = [...panel.querySelectorAll<HTMLInputElement>('[data-facet]')];
  const detail = must<HTMLElement>(panel, '[data-detail]');
  const detailClose = must<HTMLButtonElement>(panel, '[data-detail-close]');
  const live = must<HTMLElement>(panel, '[data-live]');

  const rows: LogRow[] = [];
  let current: LogRow | null = null;
  let dirty = true;
  let shownMinute = -1;

  const closeDetail = (restoreFocus: boolean): void => {
    const row = current;
    current = null;
    row?.element.removeAttribute('aria-current');
    detail.hidden = true;
    if (restoreFocus && row !== null && !row.element.hidden) {
      row.element.focus();
    }
  };

  const refresh = (): void => {
    dirty = false;
    const byQuery = rowsMatchingQuery(rows, query.value, scope);
    const checked = new Map<string, Set<string>>();
    for (const input of facetInputs) {
      const facet = input.dataset.facet ?? '';
      const count = byQuery.filter((row) => facetValue(row, facet, scope) === input.value).length;
      const label = input.closest('label')?.querySelector('[data-facet-count]');
      if (label !== null && label !== undefined) {
        label.textContent = String(count);
      }
      if (input.checked) {
        checked.set(facet, (checked.get(facet) ?? new Set<string>()).add(input.value));
      }
    }
    const shown = rowsMatchingFacets(byQuery, checked, scope);
    const shownSet = new Set(shown);
    for (const row of rows) {
      row.element.hidden = !shownSet.has(row);
    }
    logCount.textContent = `${rows.length}件中 ${shown.length}件`;
    logEmpty.hidden = shown.length !== 0;

    const now = startedAt + host.elapsedMs();
    const lastBar = Math.floor(now / minuteMs) * minuteMs;
    const firstBar = lastBar - config.visibleFromMinutes * minuteMs;
    shownMinute = lastBar;
    const view = chartOf(shown, firstBar, bars.length);
    bars.forEach((bar, index) => {
      bar.style.height = view.heights[index] ?? '0%';
      bar.dataset.warn = String(view.warns[index] ?? false);
    });
    for (const axis of axes) {
      axis.textContent = minuteOf(firstBar + Number(axis.dataset.tick ?? '0') * minuteMs);
    }
    chart.setAttribute('aria-label', view.label);
    if (current !== null && current.element.hidden) {
      closeDetail(false);
    }
  };

  const fillDetail = (row: LogRow): void => {
    for (const field of detail.querySelectorAll<HTMLElement>('[data-detail-field]')) {
      const key = field.dataset.detailField;
      field.textContent = key === 'message'
        ? row.content
        : key === 'date'
        ? row.date
        : row.level === 'warn'
        ? 'Warn'
        : 'Info';
    }
    detail.dataset.level = row.level;
    for (const attr of detail.querySelectorAll<HTMLElement>('[data-detail-attr]')) {
      attr.textContent = row.attrs.get(attr.dataset.detailAttr ?? '') ?? '';
    }
  };

  const openDetail = (row: LogRow): void => {
    current?.element.removeAttribute('aria-current');
    current = row;
    row.element.setAttribute('aria-current', 'true');
    fillDetail(row);
    detail.hidden = false;
    host.emit('log:detail-opened', { method: row.method, date: row.date });
    if (row.target) host.emit('log:target-opened');
    detailClose.focus();
  };

  const addRow = (entry: LogEntry, time: number, dynamic: boolean): void => {
    const view = describeLog(entry, time, config);
    const element = cloneFirst(rowTemplate, 'tr') as HTMLTableRowElement;
    element.dataset.level = view.level;
    element.dataset.method = view.method;
    element.dataset.cancel = String(view.target);
    element.dataset.date = view.iso;
    const dateCell = element.querySelector<HTMLElement>('[data-log-date]');
    if (dateCell !== null) {
      dateCell.textContent = view.date;
      dateCell.setAttribute('datetime', view.iso);
    }
    const levelCell = element.querySelector<HTMLElement>('[data-log-level]');
    if (levelCell !== null) {
      levelCell.textContent = view.levelLabel;
      levelCell.dataset.level = view.level;
    }
    const contentCell = element.querySelector<HTMLElement>('[data-log-content]');
    if (contentCell !== null) contentCell.textContent = view.content;
    const row: LogRow = {
      element,
      level: view.level,
      method: view.method,
      time: view.time,
      text: view.text,
      attrs: new Map(view.attrs),
      target: view.target,
      date: view.iso,
      content: view.content,
      dynamic,
    };
    element.addEventListener('click', () => openDetail(row));
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openDetail(row);
    });
    rows.push(row);
    logBody.prepend(element);
    dirty = true;
  };

  const trimRows = (): void => {
    let dynamicCount = rows.filter((row) => row.dynamic).length;
    while (dynamicCount > maxDynamicRows) {
      const index = rows.findIndex((row) => row.dynamic);
      const [removed] = rows.splice(index, 1);
      if (removed === undefined) break;
      if (current === removed) closeDetail(false);
      removed.element.remove();
      dynamicCount -= 1;
    }
  };

  const loadEarlierLogs = (): void => {
    const from = startedAt - config.visibleFromMinutes * minuteMs;
    for (const entry of config.earlier) {
      const time = Date.parse(entry.time);
      if (time >= from) addRow(entry, time, false);
    }
  };

  query.addEventListener('input', refresh);
  for (const input of facetInputs) {
    input.addEventListener('change', refresh);
  }
  detailClose.addEventListener('click', () => closeDetail(true));
  host.root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !detail.hidden) {
      event.preventDefault();
      closeDetail(true);
    }
  });

  loadEarlierLogs();
  refresh();

  return {
    perform: (effect, atMs) => {
      if (effect.kind !== 'log') return;
      addRow(effect.entry, startedAt + atMs + effect.millis, true);
    },
    rule: (ruleIndex, count) => {
      const rule = config.rules[ruleIndex];
      const request = rule?.requests[(count - 1) % (rule?.requests.length ?? 1)];
      if (rule === undefined || request === undefined) return;
      const duration = rule.durations[(count - 1) % rule.durations.length] ?? 0;
      const millis = rule.millis[(count - 1) % rule.millis.length] ?? 0;
      addRow(
        { level: 'INFO', method: request.method, path: request.path, status: 200, duration },
        startedAt + count * rule.everySeconds * 1000 + millis,
        true,
      );
    },
    update: ({ status, elapsedMs }) => {
      live.dataset.state = status === 'running' ? 'on' : 'off';
      if (status === 'running') trimRows();
      const minute = Math.floor((startedAt + elapsedMs) / minuteMs) * minuteMs;
      if (dirty || minute !== shownMinute) refresh();
    },
    open: () => {
      if (config.open === undefined) return;
      query.value = config.open.query;
      for (const input of facetInputs) input.checked = false;
      refresh();
      const target = rows.find((row) => row.target);
      if (target !== undefined) openDetail(target);
    },
    reset: () => {
      for (const row of rows.filter((item) => item.dynamic)) {
        row.element.remove();
      }
      rows.splice(0, rows.length, ...rows.filter((row) => !row.dynamic));
      query.value = query.dataset.initial ?? '';
      for (const input of facetInputs) input.checked = false;
      closeDetail(false);
      dirty = true;
      refresh();
    },
  };
};
