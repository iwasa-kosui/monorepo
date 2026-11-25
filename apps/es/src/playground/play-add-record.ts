import { EditorView } from '@codemirror/view';

import { createRuntime, RuntimeScriptError } from './client.ts';
import { applyRuntimeState, element, failureElement, query } from './dom.ts';
import { revealText } from './editor.ts';
import type { RunOutcome } from './engine/types.ts';
import { type SceneAnswer, sceneSteps } from './scene-steps.ts';
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
type RunResult = { before: Snapshot; after: Snapshot; error: string | null };
type Filled = SceneAnswer & { value: string | null };

const editedFile = 'visits.ts';
const visitId = 'visit-pochi';
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

const parseResult = (outcome: RunOutcome): RunResult | null => {
  const last = outcome.logs.at(-1)?.text;
  if (last === undefined) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(last);
    if (
      isRow(value) && isSnapshot(value.before) && isSnapshot(value.after)
      && (value.error === null || typeof value.error === 'string')
    ) {
      return { before: value.before, after: value.after, error: value.error };
    }
    return null;
  } catch {
    return null;
  }
};

const text = (
  value: string | number | null | undefined,
): string => (value === null || value === undefined ? 'NULL' : String(value));

const payloadOf = (row: Row): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(text(row.payload));
    return isRow(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const nonEmpty = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const quoted = (labels: string[]): string => labels.map((label) => `「${label}」`).join('');

const mount = (root: HTMLElement): void => {
  const config = JSON.parse(root.dataset.config ?? '{}') as Config;
  const scene = sceneSteps[config.step];
  const table = config.table;
  const templateMarker = `INSERT INTO ${table}`;
  const next = query<HTMLElement>(root, '[data-role="next"]');
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
  const visitsBody = query<HTMLElement>(root, '[data-role="visits-body"]');
  const visitsBadge = query<HTMLElement>(root, '[data-role="visits-badge"]');
  const visitsCaption = query<HTMLElement>(root, '[data-role="visits-caption"]');
  const events = query<HTMLElement>(root, '[data-role="events"]');
  const eventsBadge = query<HTMLElement>(root, '[data-role="events-badge"]');
  const eventsCaption = query<HTMLElement>(root, '[data-role="events-caption"]');
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
    testsButton.disabled = !idle;
    completeButton.disabled = !idle;
    resetButton.disabled = !idle;
    templateButton.disabled = !idle || hasRecordCode();
  };

  const say = (sentences: string[]): void => {
    next.replaceChildren(
      ...sentences.join('').split(/`([^`]+)`/).map((part, index) =>
        index % 2 === 1 ? element('code', { text: part }) : document.createTextNode(part)
      ),
    );
  };

  const pressRun = '「ポチの来院をキャンセルする」を押します。';
  const pressTemplate = config.step === 1
    ? '「記録の雛形を `UPDATE` の次の行に入れる」を押します。'
    : '「INSERT を `business_events` 用に書き換える」を押します。';
  const stepOneUnfinished =
    'ステップ1が終わっていないときは、「最初のコードに戻す」を押して、ステップ1の解答から続けます。';
  const askHints = '迷ったら、右の「ヒントと解答」を上から順に開きます。';
  const blankCount = config.template.match(blankPattern)?.length ?? 0;
  const fillBlanks = config.step === 1
    ? `雛形の ${blankCount} つの空欄を書き換え、\`input\` の型に \`reason\` と \`operatedBy\` を足します。`
    : `雛形の ${blankCount} つの空欄を書き換えます。`;

  const sayStart = (): void => {
    if (hasRecordCode()) {
      say(firstBlankPattern.test(code()) ? [fillBlanks, askHints, `終わったら${pressRun}`] : [pressRun]);
      return;
    }
    if (config.step === 2 && !code().includes(oldInsert)) {
      say([stepOneUnfinished]);
      return;
    }
    say(
      config.step === 1
        ? [pressRun, `いまのコードで、\`visits\` と \`${table}\` がどう変わるかを見ます。`]
        : [pressRun, `テーブルを \`${table}\` に作り直した後で、ステップ1のコードがどう動くかを見ます。`],
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

  const renderVisits = (before: Row[], after: Row[], phase: 'before' | 'after'): void => {
    visitsBadge.dataset.phase = phase;
    visitsBadge.textContent = phase === 'before' ? '実行前' : '実行後';
    visitsBody.replaceChildren(...after.map((row) => {
      const old = before.find((candidate) => candidate.id === row.id);
      const changed = old !== undefined && old.status !== row.status;
      const status = element('td', { className: 'play-status-cell' }, [
        element('span', { className: 'play-new-value', text: text(row.status) }),
      ]);
      if (changed) {
        status.dataset.changed = '';
        status.dataset.old = text(old.status);
      }
      return element('tr', {}, [
        element('td', { text: text(row.id) }),
        element('td', { text: text(row.pet_name) }),
        status,
      ]);
    }));
    const target = after.find((row) => row.id === visitId) ?? after[0];
    const earlier = before.find((row) => row.id === target?.id);
    if (target === undefined) {
      visitsCaption.textContent = '行がありません。';
    } else if (phase === 'before') {
      visitsCaption.textContent = `status は ${text(target.status)} です。${notRunText}。`;
    } else if (earlier !== undefined && earlier.status !== target.status) {
      visitsCaption.textContent = `status が ${text(earlier.status)} から ${text(target.status)} に変わりました。`;
    } else {
      visitsCaption.textContent = `status は ${text(target.status)} のままです。`;
    }
  };

  const eventTable = (row: Row, added: boolean): HTMLElement => {
    const rowTable = element('table', {
      className: 'play-table play-event',
      attributes: { 'aria-label': `${table} の行`, 'data-role': 'event-row' },
    }, [
      ...(added ? [element('caption', { text: '追加された行' })] : []),
      element(
        'tbody',
        {},
        Object.entries(row).map(([column, value]) =>
          element('tr', {}, [
            element('th', { text: column, attributes: { scope: 'row' } }),
            element('td', { text: text(value) }),
          ])
        ),
      ),
    ]);
    if (added) {
      rowTable.dataset.new = '';
    }
    return rowTable;
  };

  const renderEvents = (before: Row[], after: Row[], phase: 'before' | 'after'): void => {
    eventsBadge.dataset.phase = phase;
    eventsBadge.textContent = phase === 'before' ? '実行前' : '実行後';
    if (after.length === 0) {
      const empty = element('p', {
        className: 'play-empty',
        text: '行がありません',
        attributes: { 'data-role': 'events-empty' },
      });
      if (phase === 'after') {
        empty.dataset.ran = '';
      }
      events.replaceChildren(empty);
    } else {
      events.replaceChildren(...after.map((row, index) => eventTable(row, index >= before.length)));
    }
    if (phase === 'before') {
      eventsCaption.textContent = `${after.length} 行です。${notRunText}。`;
    } else if (after.length > before.length) {
      eventsCaption.textContent = `${before.length} 行から ${after.length} 行に増えました。`;
    } else {
      eventsCaption.textContent = `${after.length} 行のままです。行は増えていません。`;
    }
  };

  const valueOf = (key: SceneAnswer['key'], row: Row | undefined): string | null => {
    if (row === undefined) {
      return null;
    }
    if (config.step === 1) {
      return nonEmpty({ who: row.operated_by, when: row.cancelled_at, what: null, why: row.reason }[key]);
    }
    const payload = payloadOf(row);
    return nonEmpty({ who: payload.operatedBy, when: row.event_at, what: row.event_name, why: payload.reason }[key]);
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

  const renderTables = (result: RunResult, phase: 'before' | 'after'): void => {
    const shown = phase === 'before' ? result.before : result.after;
    renderVisits(visitsOf(result.before), visitsOf(shown), phase);
    renderEvents(recordsOf(result.before), recordsOf(shown), phase);
  };

  const clearRunResult = (initial: RunResult | null): void => {
    if (initial !== null) {
      renderTables(initial, 'before');
    }
    renderAnswers(null);
  };

  const statusChanged = (result: RunResult): boolean => {
    const target = visitsOf(result.after).find((row) => row.id === visitId) ?? visitsOf(result.after)[0];
    const earlier = visitsOf(result.before).find((row) => row.id === target?.id);
    return target !== undefined && earlier !== undefined && earlier.status !== target.status;
  };

  const resetOutputs = (initial: RunResult | null): void => {
    clearRunResult(initial);
    summary.textContent = notRunText;
    summary.dataset.result = '';
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
      say(['`visit_cancellations` テーブルは、もうありません。', ...rolledBack, pressTemplate]);
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
    ]);
  };

  const run = async (): Promise<void> => {
    if (busy || runtime.state !== 'ready') {
      return;
    }
    busy = true;
    updateControls();
    clearMessage();
    try {
      const outcome = await runtime.runCode(filesWith(), 'play-cancel.ts');
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
      if (result.error !== null) {
        showError('cancelVisit がエラーを出しました', result.error);
        sayFailedRun(result);
        return;
      }
      if (recordsOf(result.after).length > recordsOf(result.before).length) {
        sayRecorded(result);
        return;
      }
      say([
        statusChanged(result)
          ? `\`visits\` の \`status\` は変わりましたが、\`${table}\` は増えていません。`
          : `\`visits\` の \`status\` も \`${table}\` も変わっていません。`,
        hasRecordCode()
          ? 'コードを見直して、もう一度押します。'
          : config.step === 2 && !code().includes(oldInsert)
          ? stepOneUnfinished
          : pressTemplate,
      ]);
    } catch (error) {
      showMessage(failureElement(error, '終わらない繰り返しがないか確かめてください'));
    } finally {
      busy = false;
      updateControls();
    }
  };

  const runTests = async (): Promise<void> => {
    if (busy || runtime.state !== 'ready') {
      return;
    }
    busy = true;
    updateControls();
    clearMessage();
    try {
      const outcome = await runtime.runCode(filesWith(), 'visits.test.ts');
      failed.replaceChildren();
      if (outcome.error !== null) {
        summary.textContent = 'テストを実行できませんでした';
        summary.dataset.result = 'error';
        showError('コードを最後まで実行できませんでした', outcome.error);
        return;
      }
      if (outcome.tests === null) {
        summary.textContent = 'テストが見つかりませんでした';
        summary.dataset.result = 'error';
        return;
      }
      const passed = outcome.tests.filter((test) => test.status === 'pass').length;
      const failures = outcome.tests.filter((test) => test.status === 'fail');
      summary.textContent = `pass ${passed} / fail ${failures.length}`;
      summary.dataset.result = failures.length === 0 ? 'pass' : 'fail';
      failed.replaceChildren(...failures.map((test) =>
        element('li', {}, [
          element('strong', { text: [...test.path, test.name].join(' > ') }),
          element('span', { text: (test.message ?? '').split('\n')[0] ?? '' }),
        ])
      ));
      if (failures.length === 0) {
        say(['すべてのテストが成功しました。', '次のページへ進みます。']);
      } else {
        say([
          'テストの結果に、失敗したテストの名前を出しています。',
          hasRecordCode()
            ? 'コードを直して、もう一度押せます。'
            : config.step === 2 && !code().includes(oldInsert)
            ? stepOneUnfinished
            : pressTemplate,
        ]);
      }
    } catch (error) {
      showMessage(failureElement(error, '終わらない繰り返しがないか確かめてください'));
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
  const closeHint = (details: HTMLDetailsElement | null, moveFocus: boolean): void => {
    if (details === null) {
      return;
    }
    details.open = false;
    if (moveFocus) {
      details.querySelector('summary')?.focus();
    }
  };

  for (const button of root.querySelectorAll<HTMLElement>('[data-role="hint-close"]')) {
    button.addEventListener('click', () => closeHint(button.closest('details'), true));
  }
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !(event.target instanceof Element)) {
      return;
    }
    closeHint(event.target.closest<HTMLDetailsElement>('details.play-hint-step[open]'), true);
  });

  const load = (target: string, sentences: string[]): void => {
    workbench.open(editedFile);
    replaceWithBackup(target);
    clearMessage();
    say(sentences);
  };

  completeButton.addEventListener('click', () => {
    closeHint(completeButton.closest('details'), false);
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
