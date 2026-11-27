import { EditorView } from '@codemirror/view';

import { setAction } from '../lesson/action-bar.ts';
import { notifyNudge, nudgeAttribute } from '../lesson/nudge.ts';
import { testReportOf } from './agent-client.ts';
import type { TestReport } from './agent-protocol.ts';
import { cancelInputSource, statusLabelOf, targetVisitId } from './cancel-form.ts';
import { createRuntime, RuntimeScriptError } from './client.ts';
import { applyRuntimeState, element, failureElement, query } from './dom.ts';
import { revealText } from './editor.ts';
import type { RunOutcome } from './engine/types.ts';
import { mountAgent } from './play-agent.ts';
import { answersOfColumn, type SceneAnswer, sceneSteps } from './scene-steps.ts';
import { clearEdits, loadEdits, saveEdits } from './storage.ts';
import { createWorkbench } from './workbench.ts';

type Config = {
  step: 1 | 2;
  storageId: string;
  carryFrom: string | null;
  table: string;
  files: Record<string, string>;
  project: string[];
  initial: string;
  complete: string;
  template: string;
};

type Row = Record<string, string | number | null>;
type Snapshot = Record<string, Row[]>;
type Columns = Record<string, string[]>;
type RunResult = { before: Snapshot; after: Snapshot; columns: Columns; error: string | null };
type Filled = SceneAnswer & { value: string | null };

const editedFile = 'visits.ts';
const inputFile = 'play-input.ts';
const longCellLength = 30;
const updateMarker = '\'cancelled\'';
const functionMarker = 'export const cancelVisit';
const oldInsert = 'INSERT INTO visit_cancellations';
const blankPattern = /\/\* [^*\n]+ \*\//g;
const firstBlankPattern = /\/\* [^*\n]+ \*\//;
const missingText = '記録にありません';
const notRunText = 'まだ実行していません';

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);

const isSnapshot = (value: unknown): value is Snapshot =>
  isRow(value) && Object.values(value).every((rows) => Array.isArray(rows) && rows.every(isRow));

const isColumns = (value: unknown): value is Columns =>
  isRow(value)
  && Object.values(value).every((names) => Array.isArray(names) && names.every((name) => typeof name === 'string'));

const parseResult = (outcome: RunOutcome): RunResult | null => {
  const last = outcome.logs.at(-1)?.text;
  if (last === undefined) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(last);
    if (
      isRow(value) && isSnapshot(value.before) && isSnapshot(value.after) && isColumns(value.columns)
      && (value.error === null || typeof value.error === 'string')
    ) {
      return { before: value.before, after: value.after, columns: value.columns, error: value.error };
    }
    return null;
  } catch {
    return null;
  }
};

const text = (
  value: string | number | null | undefined,
): string => (value === null || value === undefined ? 'NULL' : String(value));

const fieldOf = (cell: Row[string] | undefined, field: string): unknown => {
  try {
    const parsed: unknown = JSON.parse(text(cell));
    return isRow(parsed) ? parsed[field] : undefined;
  } catch {
    return undefined;
  }
};

const nonEmpty = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const quoted = (labels: string[]): string => labels.map((label) => `「${label}」`).join('');

const mount = (root: HTMLElement): void => {
  const config = JSON.parse(root.dataset.config ?? '{}') as Config;
  const scene = sceneSteps[config.step];
  const table = config.table;
  const templateMarker = `INSERT INTO ${table}`;
  const message = query<HTMLElement>(root, '[data-role="message"]');
  const runButton = query<HTMLButtonElement>(root, '[data-role="run"]');
  const templateButton = query<HTMLButtonElement>(root, '[data-role="template"]');
  const completeButton = query<HTMLButtonElement>(
    root,
    config.step === 1 ? '[data-role="complete"]' : '[data-role="complete-step-2"]',
  );
  const resetButton = query<HTMLButtonElement>(root, '[data-role="reset"]');
  const restoreButton = query<HTMLButtonElement>(root, '[data-role="restore"]');
  const testsButton = query<HTMLButtonElement>(root, '[data-role="tests"]');
  const retryButton = query<HTMLButtonElement>(root, '[data-role="retry"]');
  const hintsOpenButton = query<HTMLButtonElement>(root, '[data-role="hints-open"]');
  const hintsCloseButton = query<HTMLButtonElement>(root, '[data-role="hints-close"]');
  const hintsDialog = query<HTMLDialogElement>(root, '[data-role="hints-dialog"]');
  const reasonSelect = query<HTMLSelectElement>(root, '[data-role="cancel-reason"]');
  const appVisits = query<HTMLElement>(root, '[data-role="app-visits"]');
  const appDetailTitle = query<HTMLElement>(root, '[data-role="app-detail-title"]');
  const appBanner = query<HTMLElement>(root, '[data-role="app-banner"]');
  const visits = query<HTMLElement>(root, '[data-role="visits"]');
  const visitsBadge = query<HTMLElement>(root, '[data-role="visits-badge"]');
  const visitsCount = query<HTMLElement>(root, '[data-role="visits-count"]');
  const events = query<HTMLElement>(root, '[data-role="events"]');
  const eventsBadge = query<HTMLElement>(root, '[data-role="events-badge"]');
  const eventsCount = query<HTMLElement>(root, '[data-role="events-count"]');
  const summary = query<HTMLElement>(root, '[data-role="summary"]');
  const failed = query<HTMLElement>(root, '[data-role="failed"]');
  const answerCells = [...root.querySelectorAll<HTMLElement>('[data-answer]')];
  root.setAttribute('data-mounted', '');

  let busy = false;
  let hasResult = false;
  let backup: string | null = null;

  const discardBackup = (): void => {
    backup = null;
    restoreButton.hidden = true;
  };

  const startCode = (): string =>
    config.carryFrom === null ? config.initial : loadEdits(config.carryFrom)[editedFile] ?? config.initial;

  const storedCode = (): string => loadEdits(config.storageId)[editedFile] ?? startCode();

  const workbench = createWorkbench({
    root,
    files: Object.fromEntries(
      config.project.map((file) => [file, file === editedFile ? storedCode() : config.files[file] ?? '']),
    ),
    baseline: config.files,
    editable: [editedFile],
    opened: [editedFile],
    active: editedFile,
    wrap: true,
    typecheck: true,
    foldExcept: { file: editedFile, name: 'cancelVisit' },
    onChange: () => {
      persist();
      discardBackup();
      updateControls();
    },
  });
  const view = workbench.view;

  const code = (): string => workbench.doc(editedFile);

  function persist(): void {
    if (code() === startCode()) {
      clearEdits(config.storageId);
    } else {
      saveEdits(config.storageId, { [editedFile]: code() });
    }
  }

  const reveal = (marker: string): void => {
    if (workbench.active() === editedFile) {
      revealText(view, marker, 4);
    }
  };

  const revealFunction = (): void => reveal(functionMarker);

  const setCode = (doc: string): void => {
    workbench.replaceDoc(editedFile, doc);
    revealFunction();
  };

  const replaceWithBackup = (target: string): void => {
    const before = code();
    setCode(target);
    backup = before === config.initial || before === target ? null : before;
    restoreButton.hidden = backup === null;
  };

  const filesWith = (): Record<string, string> => ({ ...config.files, [editedFile]: code() });

  const hasRecordCode = (): boolean => code().includes(templateMarker);

  const updateControls = (): void => {
    const idle = !busy && root.dataset.state === 'ready';
    runButton.disabled = !idle;
    reasonSelect.disabled = !idle;
    testsButton.disabled = !idle;
    completeButton.disabled = !idle;
    resetButton.disabled = !idle;
    templateButton.disabled = !idle || hasRecordCode();
  };

  const labelOf = (button: HTMLButtonElement): string => (button.textContent ?? '').replace(/\s+/g, ' ').trim();

  const nudgeHints = (on: boolean): void => {
    if (on) hintsOpenButton.setAttribute(nudgeAttribute, '');
    else hintsOpenButton.removeAttribute(nudgeAttribute);
    notifyNudge();
  };

  const say = (sentences: string[], button: HTMLButtonElement | null = null): void => {
    setAction({
      state: 'do',
      text: sentences.join('').replaceAll('`', ''),
      button: button === null ? null : { label: labelOf(button), onClick: () => button.click() },
    });
    nudgeHints(button === null);
  };

  const showSummary = (value: string, result: 'pass' | 'fail' | 'error' | ''): void => {
    summary.textContent = value;
    summary.dataset.result = result;
    summary.classList.toggle('result--ok', result === 'pass');
    summary.classList.toggle('result--ng', result === 'fail' || result === 'error');
  };

  const pressRun = '「ポチの来院をキャンセルする」を押します。';
  const pressTemplate = config.step === 1
    ? '「記録の雛形を `UPDATE` の次の行に入れる」を押します。'
    : '「INSERT を `business_events` 用に書き換える」を押します。';
  const stepOneUnfinished =
    'ステップ1が終わっていないときは、「最初のコードに戻す」を押して、ステップ1の解答から続けます。';
  const askHints = '判断に迷うときは、エディタの下の「ヒントと解答」を上から順に開きます。';
  const blankCount = config.template.match(blankPattern)?.length ?? 0;
  const fillBlanks = config.step === 1
    ? `雛形の ${blankCount} つの空欄を書き換え、\`input\` の型に \`reason\` と \`operatedBy\` を足します。`
    : `雛形の ${blankCount} つの空欄を書き換えます。`;

  const recoverFrom = (retry: string): { sentence: string; button: HTMLButtonElement | null } => {
    if (hasRecordCode()) {
      return { sentence: retry, button: null };
    }
    if (config.step === 2 && !code().includes(oldInsert)) {
      return { sentence: stepOneUnfinished, button: resetButton };
    }
    return { sentence: pressTemplate, button: templateButton };
  };

  const sayStart = (): void => {
    if (hasRecordCode()) {
      if (firstBlankPattern.test(code())) {
        say([fillBlanks, askHints, `終わったら${pressRun}`]);
      } else {
        say([pressRun], runButton);
      }
      return;
    }
    if (config.step === 2 && !code().includes(oldInsert)) {
      say([stepOneUnfinished], resetButton);
      return;
    }
    say(
      config.step === 1
        ? [pressRun, `いまのコードで、\`visits\` と \`${table}\` がどう変わるかを見ます。`]
        : [pressRun, `テーブルを \`${table}\` に作り直した後で、ステップ1のコードがどう動くかを見ます。`],
      runButton,
    );
  };

  const clearMessage = (): void => {
    message.replaceChildren();
    message.hidden = true;
  };

  const showMessage = (...children: HTMLElement[]): void => {
    message.replaceChildren(...children);
    message.hidden = false;
  };

  const showError = (heading: string, detail: string): void => {
    showMessage(
      element('div', { className: 'playground-error', attributes: { role: 'alert' } }, [
        element('p', { text: heading }),
        element('pre', { text: detail }),
      ]),
    );
  };

  type GridSpec = {
    label: string;
    columns: string[];
    rows: Row[];
    addedFrom: number;
    chips: boolean;
    emptyRole: string;
    ran: boolean;
    cell: (row: Row, column: string) => HTMLElement;
  };

  const plainCell = (value: Row[string] | undefined): HTMLElement => {
    const shown = text(value);
    return element('td', { className: shown.length > longCellLength ? 'play-long' : '', text: shown });
  };

  const renderGrid = (container: HTMLElement, spec: GridSpec): void => {
    const head = element('thead', {}, [
      element('tr', {}, [
        element('td', { className: 'play-rownum' }),
        ...spec.columns.map((column) =>
          element('th', { attributes: { scope: 'col' } }, [
            element('span', { className: 'play-col-name', text: column }),
            ...(spec.chips
              ? answersOfColumn(scene, column).map((answer) =>
                element('span', { className: 'play-chip', text: answer.label })
              )
              : []),
          ])
        ),
      ]),
    ]);
    const rows = spec.rows.map((row, index) => {
      const added = index >= spec.addedFrom;
      const line = element('tr', {}, [
        element('th', { className: 'play-rownum', attributes: { scope: 'row' } }, [
          String(index + 1),
          ...(added ? [element('span', { className: 'play-sr', text: '追加された行' })] : []),
        ]),
        ...spec.columns.map((column) => spec.cell(row, column)),
      ]);
      if (added) {
        line.dataset.new = '';
      }
      return line;
    });
    if (rows.length === 0) {
      const empty = element('td', {
        className: 'play-empty',
        text: '行がありません',
        attributes: { colspan: String(spec.columns.length + 1), 'data-role': spec.emptyRole },
      });
      if (spec.ran) {
        empty.dataset.ran = '';
      }
      rows.push(element('tr', {}, [empty]));
    }
    container.replaceChildren(
      element('table', { className: 'play-grid-table', attributes: { 'aria-label': spec.label } }, [
        head,
        element('tbody', {}, rows),
      ]),
    );
  };

  const renderRecords = (container: HTMLElement, spec: GridSpec): void => {
    const span = String(spec.columns.length);
    const fields = (row: Row | null): HTMLElement[] =>
      spec.columns.map((column) => {
        const name = element('th', { className: 'play-field-name', attributes: { scope: 'row' } }, [
          element('span', { className: 'play-col-name', text: column }),
          ...(spec.chips
            ? answersOfColumn(scene, column).map((answer) =>
              element('span', { className: 'play-chip', text: answer.label })
            )
            : []),
        ]);
        return element('tr', {}, [
          name,
          element('td', { className: 'play-field-value', text: row === null ? '' : text(row[column]) }),
        ]);
      });
    const block = (row: Row | null, index: number): HTMLElement => {
      const added = row !== null && index >= spec.addedFrom;
      const lines = fields(row);
      const number = element(
        row === null ? 'td' : 'th',
        {
          className: 'play-rownum',
          attributes: row === null ? { rowspan: span } : { rowspan: span, scope: 'rowgroup' },
        },
        row === null ? [] : [
          String(index + 1),
          ...(added ? [element('span', { className: 'play-sr', text: '追加された行' })] : []),
        ],
      );
      lines[0]?.prepend(number);
      const body = element('tbody', {}, lines);
      if (added) {
        body.dataset.new = '';
      }
      return body;
    };
    const blocks = spec.rows.length === 0 ? [block(null, 0)] : spec.rows.map(block);
    if (spec.rows.length === 0) {
      const empty = element('td', {
        className: 'play-empty',
        text: '行がありません',
        attributes: { colspan: '3', 'data-role': spec.emptyRole },
      });
      if (spec.ran) {
        empty.dataset.ran = '';
      }
      blocks.push(element('tbody', {}, [element('tr', {}, [empty])]));
    }
    container.replaceChildren(
      element('table', {
        className: 'play-grid-table play-record-table',
        attributes: { 'aria-label': spec.label },
      }, blocks),
    );
  };

  const renderAppVisits = (before: Row[], after: Row[]): void => {
    appVisits.replaceChildren(...after.map((row) => {
      const old = before.find((candidate) => candidate.id === row.id);
      const status = element('td', {}, [
        element('span', {
          className: 'play-badge',
          text: statusLabelOf(text(row.status)),
          attributes: { 'data-status': text(row.status) },
        }),
      ]);
      if (old !== undefined && old.status !== row.status) {
        status.dataset.changed = '';
      }
      const line = element('tr', {}, [
        element('td', { text: text(row.pet_name) }),
        element('td', { className: 'play-visit-id', text: text(row.id) }),
        status,
      ]);
      if (row.id === targetVisitId) {
        line.dataset.selected = '';
        line.setAttribute('aria-current', 'true');
      }
      return line;
    }));
    const target = after.find((row) => row.id === targetVisitId);
    if (target !== undefined) {
      appDetailTitle.textContent = `${text(target.pet_name)}の来院`;
    }
  };

  const renderVisits = (before: Row[], after: Row[], columns: string[], phase: 'before' | 'after'): void => {
    visitsBadge.dataset.phase = phase;
    visitsBadge.textContent = phase === 'before' ? '実行前' : '実行後';
    renderAppVisits(before, after);
    renderGrid(visits, {
      label: 'visits テーブルの行',
      columns,
      rows: after,
      addedFrom: Infinity,
      chips: false,
      emptyRole: 'visits-empty',
      ran: false,
      cell: (row, column) => {
        if (column !== 'status') {
          return plainCell(row[column]);
        }
        const old = before.find((candidate) => candidate.id === row.id);
        const changed = old !== undefined && old.status !== row.status;
        const cell = element('td', { className: 'play-status-cell' }, [
          element('span', { className: changed ? 'play-new-value marker' : 'play-new-value', text: text(row.status) }),
        ]);
        if (changed) {
          cell.dataset.changed = '';
          cell.dataset.old = text(old.status);
        }
        return cell;
      },
    });
    visitsCount.textContent = `${after.length} 行`;
  };

  const renderEvents = (before: Row[], after: Row[], columns: string[], phase: 'before' | 'after'): void => {
    eventsBadge.dataset.phase = phase;
    eventsBadge.textContent = phase === 'before' ? '実行前' : '実行後';
    (scene.layout === 'record' ? renderRecords : renderGrid)(events, {
      label: `${table} の行`,
      columns,
      rows: after,
      addedFrom: before.length,
      chips: true,
      emptyRole: 'events-empty',
      ran: phase === 'after',
      cell: (row, column) => plainCell(row[column]),
    });
    eventsCount.textContent = after.length > before.length
      ? `${after.length} 行（${after.length - before.length} 行追加）`
      : `${after.length} 行`;
  };

  const valueOf = (key: SceneAnswer['key'], row: Row | undefined): string | null => {
    const source = scene.sources[key];
    if (row === undefined || source === null) {
      return null;
    }
    const cell = row[source.column];
    return nonEmpty(source.field === undefined ? cell : fieldOf(cell, source.field));
  };

  const answersOf = (rows: Row[]): Filled[] =>
    scene.answers.map((answer) => ({ ...answer, value: valueOf(answer.key, rows[0]) }));

  const renderAnswers = (rows: Row[] | null): void => {
    const filled = rows === null ? null : answersOf(rows);
    for (const cell of answerCells) {
      const value = query<HTMLElement>(cell, '[data-role="answer-value"]');
      const answer = filled?.find((candidate) => candidate.key === cell.dataset.answer);
      delete value.dataset.filled;
      delete value.dataset.empty;
      if (answer === undefined) {
        value.textContent = notRunText;
      } else if (answer.value === null) {
        value.textContent = missingText;
        value.dataset.empty = '';
      } else {
        value.textContent = answer.value;
        value.dataset.filled = '';
      }
    }
  };

  const recordsOf = (snapshot: Snapshot): Row[] => snapshot[table] ?? [];
  const visitsOf = (snapshot: Snapshot): Row[] => snapshot.visits ?? [];

  const columnsOf = (result: RunResult, name: string, rows: Row[]): string[] =>
    result.columns[name] ?? Object.keys(rows[0] ?? {});

  const renderTables = (result: RunResult, phase: 'before' | 'after'): void => {
    const shown = phase === 'before' ? result.before : result.after;
    renderVisits(
      visitsOf(result.before),
      visitsOf(shown),
      columnsOf(result, 'visits', visitsOf(shown)),
      phase,
    );
    renderEvents(
      recordsOf(result.before),
      recordsOf(shown),
      columnsOf(result, table, recordsOf(shown)),
      phase,
    );
  };

  const statusChanged = (result: RunResult): boolean => {
    const target = visitsOf(result.after).find((row) => row.id === targetVisitId);
    const earlier = visitsOf(result.before).find((row) => row.id === targetVisitId);
    return target !== undefined && earlier !== undefined && earlier.status !== target.status;
  };

  const renderBanner = (result: RunResult | null): void => {
    const cancelled = result !== null && statusChanged(result)
      && visitsOf(result.after).find((row) => row.id === targetVisitId)?.status === 'cancelled';
    if (result !== null && result.error !== null) {
      appBanner.textContent = 'キャンセルできませんでした。';
      appBanner.dataset.result = 'ng';
    } else if (cancelled) {
      appBanner.textContent = 'ポチの来院をキャンセルしました。';
      appBanner.dataset.result = 'ok';
    } else {
      appBanner.textContent = '';
      delete appBanner.dataset.result;
    }
  };

  const clearRunResult = (initial: RunResult | null): void => {
    if (initial !== null) {
      renderTables(initial, 'before');
    }
    renderAnswers(null);
    renderBanner(null);
  };

  const resetOutputs = (initial: RunResult | null): void => {
    clearRunResult(initial);
    showSummary(notRunText, '');
    failed.replaceChildren();
    clearMessage();
  };

  let initialResult: RunResult | null = null;

  const runtime = createRuntime((state) => {
    applyRuntimeState(root, state);
    updateControls();
    if (state === 'ready' && !hasResult) {
      void loadInitial();
    }
  }, (detail) => {
    showMessage(failureElement(new RuntimeScriptError(detail), ''));
  });

  async function loadInitial(): Promise<void> {
    if (busy) {
      return;
    }
    busy = true;
    updateControls();
    try {
      const result = parseResult(await runtime.runCode(config.files, 'play-initial.ts'));
      if (result !== null) {
        initialResult = result;
        hasResult = true;
        resetOutputs(result);
      }
    } catch (error) {
      showMessage(failureElement(error, ''));
    } finally {
      busy = false;
      updateControls();
    }
  }

  const sayFailedRun = (result: RunResult): void => {
    const rolledBack = statusChanged(result)
      ? []
      : [
        '`visits` の `status` は `reserved` のままです。',
        ...(hasRecordCode() || code().includes(oldInsert)
          ? ['記録を書き込めないときは、`UPDATE` も一緒に取り消されます。']
          : []),
      ];
    if (config.step === 2 && !hasRecordCode() && result.error?.includes('visit_cancellations') === true) {
      say(['`visit_cancellations` テーブルは、もうありません。', ...rolledBack, pressTemplate], templateButton);
      return;
    }
    say([...rolledBack, 'エラーの文を読んでコードを直し、もう一度押します。']);
  };

  const sayRecorded = (result: RunResult): void => {
    const answers = answersOf(recordsOf(result.after));
    const added = `\`${table}\` に ${recordsOf(result.after).length - recordsOf(result.before).length} 行増えました。`;
    const unfilled = answers.filter((answer) => answer.value === null).map((answer) => answer.label);
    if (unfilled.length > 0) {
      say([
        added,
        `答えの欄の${quoted(unfilled)}は、まだ「${missingText}」です。`,
        config.step === 1
          ? '空欄に入れた値を見直して、もう一度押します。'
          : '`payload` に `reason` と `operatedBy` が入っているかを見直して、もう一度押します。',
      ]);
      return;
    }
    say([
      added,
      `答えの欄の${quoted(answers.map((answer) => answer.label))}が埋まりました。`,
      '「テストを実行する」を押します。',
    ], testsButton);
  };

  const run = async (): Promise<void> => {
    if (busy || runtime.state !== 'ready') {
      return;
    }
    busy = true;
    updateControls();
    clearMessage();
    try {
      const outcome = await runtime.runCode(
        { ...filesWith(), [inputFile]: cancelInputSource(reasonSelect.value) },
        'play-cancel.ts',
      );
      if (outcome.error !== null) {
        clearRunResult(initialResult);
        showError('コードを最後まで実行できませんでした', outcome.error);
        return;
      }
      const result = parseResult(outcome);
      if (result === null) {
        clearRunResult(initialResult);
        showError('実行の結果を読み取れませんでした', outcome.logs.map((line) => line.text).join('\n'));
        return;
      }
      hasResult = true;
      renderTables(result, 'after');
      renderAnswers(recordsOf(result.after));
      renderBanner(result);
      if (result.error !== null) {
        showError('cancelVisit がエラーを出しました', result.error);
        sayFailedRun(result);
        return;
      }
      if (recordsOf(result.after).length > recordsOf(result.before).length) {
        sayRecorded(result);
        return;
      }
      const recovery = recoverFrom('コードを見直して、もう一度押します。');
      say([
        statusChanged(result)
          ? `\`visits\` の \`status\` は変わりましたが、\`${table}\` は増えていません。`
          : `\`visits\` の \`status\` も \`${table}\` も変わっていません。`,
        recovery.sentence,
      ], recovery.button);
    } catch (error) {
      showMessage(failureElement(error, '終わらない繰り返しがないか確かめてください'));
    } finally {
      busy = false;
      updateControls();
    }
  };

  const runTests = async (): Promise<TestReport | null> => {
    if (busy || runtime.state !== 'ready') {
      return null;
    }
    busy = true;
    updateControls();
    clearMessage();
    try {
      const outcome = await runtime.runCode(filesWith(), 'visits.test.ts');
      failed.replaceChildren();
      if (outcome.error !== null) {
        showSummary('テストを実行できませんでした', 'error');
        showError('コードを最後まで実行できませんでした', outcome.error);
        return null;
      }
      if (outcome.tests === null) {
        showSummary('テストが見つかりませんでした', 'error');
        return null;
      }
      const passed = outcome.tests.filter((test) => test.status === 'pass').length;
      const failures = outcome.tests.filter((test) => test.status === 'fail');
      showSummary(`pass ${passed} / fail ${failures.length}`, failures.length === 0 ? 'pass' : 'fail');
      failed.replaceChildren(...failures.map((test) =>
        element('li', {}, [
          element('strong', { className: 'result--ng', text: [...test.path, test.name].join(' > ') }),
          element('span', { text: (test.message ?? '').split('\n')[0] ?? '' }),
        ])
      ));
      if (failures.length === 0) {
        setAction({ state: 'done', text: 'すべてのテストが成功しました。次のページへ進みます。', button: null });
        nudgeHints(false);
      } else {
        const recovery = recoverFrom('コードを直して、もう一度押せます。');
        say(['テストの結果に、失敗したテストの名前を出しています。', recovery.sentence], recovery.button);
      }
      return testReportOf(outcome.tests);
    } catch (error) {
      showMessage(failureElement(error, '終わらない繰り返しがないか確かめてください'));
      return null;
    } finally {
      busy = false;
      updateControls();
    }
  };

  const insertAfterUpdate = (doc: string): { from: number; to: number; insert: string } | null => {
    const marker = doc.indexOf(updateMarker, Math.max(doc.indexOf(functionMarker), 0));
    if (marker === -1) {
      return null;
    }
    const lineEnd = view.state.doc.lineAt(marker).to;
    return { from: lineEnd, to: lineEnd, insert: `\n${config.template}` };
  };

  const replaceOldInsert = (doc: string): { from: number; to: number; insert: string } | null => {
    const old = doc.indexOf(oldInsert);
    const statement = old === -1 ? -1 : doc.lastIndexOf('db.prepare(', old);
    if (statement === -1) {
      return null;
    }
    let line = view.state.doc.lineAt(old);
    while (!line.text.trimEnd().endsWith(');') && line.number < view.state.doc.lines) {
      line = view.state.doc.line(line.number + 1);
    }
    return { from: view.state.doc.lineAt(statement).from, to: line.to, insert: config.template };
  };

  const insertRecordTemplate = (): void => {
    workbench.open(editedFile);
    const doc = code();
    const change = hasRecordCode()
      ? null
      : (config.step === 2 ? replaceOldInsert(doc) : null) ?? insertAfterUpdate(doc);
    if (change === null) {
      showError('雛形を入れる場所が見つかりません', '「最初のコードに戻す」を押してから、もう一度試してください。');
      return;
    }
    clearMessage();
    const first = firstBlankPattern.exec(change.insert);
    const from = change.from + (first?.index ?? 0);
    view.dispatch({
      changes: change,
      selection: { anchor: from, head: from + (first?.[0].length ?? 0) },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });
    view.focus();
    updateControls();
    say([fillBlanks, 'Tab キーで次の空欄に移れます。', askHints, `終わったら${pressRun}`]);
  };

  query<HTMLElement>(root, '[data-role="editor"]').addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (workbench.active() !== editedFile) {
      return;
    }
    const after = view.state.selection.main.to;
    const found = [...code().matchAll(blankPattern)].find((match) => match.index >= after);
    if (found === undefined) {
      return;
    }
    event.preventDefault();
    view.dispatch({
      selection: { anchor: found.index, head: found.index + found[0].length },
      effects: EditorView.scrollIntoView(found.index, { y: 'center' }),
    });
  });

  runButton.addEventListener('click', () => void run());
  testsButton.addEventListener('click', () => void runTests());
  templateButton.addEventListener('click', insertRecordTemplate);
  hintsOpenButton.addEventListener('click', () => hintsDialog.showModal());
  hintsCloseButton.addEventListener('click', () => hintsDialog.close());
  hintsDialog.addEventListener('click', (event) => {
    if (event.target === hintsDialog) {
      hintsDialog.close();
    }
  });

  const load = (target: string, sentences: string[]): void => {
    workbench.open(editedFile);
    replaceWithBackup(target);
    clearMessage();
    say(sentences, runButton);
  };

  mountAgent(root, config.step, {
    code,
    replace: (doc) => {
      workbench.open(editedFile);
      replaceWithBackup(doc);
    },
    runTests,
  });

  completeButton.addEventListener('click', () => {
    hintsDialog.close();
    load(
      config.complete,
      config.step === 1
        ? ['ステップ1の完成コードを読み込みました。', pressRun]
        : [
          'ステップ2の完成コードを読み込みました。',
          '全テストが成功するコードです。第3章は自分のコードを使わなくても進められます。',
          pressRun,
        ],
    );
  });
  resetButton.addEventListener('click', () => {
    workbench.open(editedFile);
    replaceWithBackup(config.initial);
    resetOutputs(initialResult);
    sayStart();
    updateControls();
  });
  restoreButton.addEventListener('click', () => {
    if (backup !== null) {
      workbench.open(editedFile);
      setCode(backup);
    }
    discardBackup();
    clearMessage();
    sayStart();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      const restored = storedCode();
      if (restored !== code()) {
        setCode(restored);
      }
      discardBackup();
      updateControls();
    }
  });
  retryButton.addEventListener('click', () => runtime.reload());

  revealFunction();
  sayStart();
  updateControls();
};

for (const root of document.querySelectorAll<HTMLElement>('[data-play="add-record"]')) {
  mount(root);
}
