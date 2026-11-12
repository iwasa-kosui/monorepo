import { createRuntime, RuntimeScriptError, RuntimeTimeoutError } from './client.ts';
import { applyRuntimeState, element, failureElement, query } from './dom.ts';
import { createEditorState, createEditorView } from './editor.ts';
import { maxSqlCellChars } from './engine/limits.ts';
import { maxDisplayedRows } from './engine/sql-session.ts';
import type { SqlCell, SqlRunOutcome, SqlStatementResult } from './engine/types.ts';
import { clearSql, loadEdits, loadSql, saveSql } from './storage.ts';

type SetupScript = {
  files: Record<string, string>;
  entry: string;
  own: { storageKey: string; file: string; testFile: string } | null;
};

type SqlConfig = {
  storageId: string;
  setupSql: string | null;
  setupScript: SetupScript | null;
  initialSql: string;
};

const originMessages = {
  own: '第2章で書いた visits.ts で、このデータベースを作りました。',
  failing:
    '第2章で書いた visits.ts は全部のテストに成功していないので、ステップ2の完成コードでこのデータベースを作りました。',
  missing: '第2章で書いた visits.ts が保存されていないので、ステップ2の完成コードでこのデータベースを作りました。',
  unbuildable:
    '第2章で書いた visits.ts ではデータベースを作れなかったので、ステップ2の完成コードでこのデータベースを作りました。',
};

const oneLine = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

const renderCell = (cell: SqlCell): HTMLTableCellElement =>
  cell === null
    ? element('td', { className: 'playground-null', text: 'NULL' })
    : element('td', { text: String(cell) });

const renderStatement = (sql: string): HTMLElement =>
  element('p', { className: 'playground-statement' }, [
    element('code', { text: oneLine(sql), attributes: { title: sql.trim() } }),
  ]);

const renderResult = (result: SqlStatementResult): HTMLElement => {
  const parts: HTMLElement[] = [renderStatement(result.sql)];
  if (result.kind === 'rows') {
    const head = element('tr', {}, result.columns.map((name) => element('th', { text: name })));
    const body = result.rows.map((row) => element('tr', {}, row.map(renderCell)));
    parts.push(element('table', {}, [element('thead', {}, [head]), element('tbody', {}, body)]));
    parts.push(element('p', {
      className: 'playground-note',
      text: result.totalRows > maxDisplayedRows
        ? `全 ${result.totalRows} 行のうち、先頭の ${maxDisplayedRows} 行を表示しています`
        : `${result.totalRows} 行`,
    }));
    if (result.cutCells > 0) {
      parts.push(element('p', {
        className: 'playground-note',
        text: `長い値が ${result.cutCells} 個あるため、先頭の ${maxSqlCellChars} 文字までを表示しています`,
      }));
    }
  } else if (result.kind === 'changes') {
    parts.push(element('p', { className: 'playground-note', text: `${result.changes} 行を変更しました` }));
  } else {
    parts.push(element('p', { className: 'playground-note', text: '実行しました' }));
  }
  return element('div', { className: 'playground-result' }, parts);
};

const renderError = (error: { sql: string | null; message: string }): HTMLElement =>
  element('div', { className: 'playground-error', attributes: { role: 'alert' } }, [
    element('p', { text: error.sql === null ? 'エラーが起きました' : 'この文でエラーが起きました' }),
    ...(error.sql === null ? [] : [renderStatement(error.sql)]),
    element('pre', { text: error.message }),
  ]);

const renderOutcome = (outcome: SqlRunOutcome): HTMLElement[] => {
  const elements = outcome.results.map(renderResult);
  if (outcome.error !== null) {
    elements.push(renderError(outcome.error));
  } else if (elements.length === 0) {
    elements.push(element('p', { className: 'playground-note', text: '実行する文がありません' }));
  }
  return elements;
};

const mount = (root: HTMLElement): void => {
  const config = JSON.parse(root.dataset.config ?? '{}') as SqlConfig;
  const runButton = query<HTMLButtonElement>(root, '[data-role="run"]');
  const resetButton = query<HTMLButtonElement>(root, '[data-role="reset"]');
  const retryButton = query<HTMLButtonElement>(root, '[data-role="retry"]');
  const resetSqlButton = query<HTMLButtonElement>(root, '[data-role="reset-sql"]');
  const restoreButton = query<HTMLButtonElement>(root, '[data-role="restore"]');
  const results = query<HTMLElement>(root, '[data-role="results"]');
  const origin = query<HTMLElement>(root, '[data-role="origin"]');
  root.setAttribute('data-mounted', '');
  let busy = false;
  let backup: string | null = null;
  let preparedGeneration = -1;

  const updateControls = (): void => {
    const disabled = busy || root.dataset.state !== 'ready';
    runButton.disabled = disabled;
    resetButton.disabled = disabled;
  };

  const show = (...elements: Node[]): void => {
    results.replaceChildren(...elements);
  };

  const showFailure = (error: unknown): void => {
    show(failureElement(error, 'データベースは最初の状態に戻しました'));
  };

  const runtime = createRuntime((state) => {
    applyRuntimeState(root, state);
    updateControls();
    if (state === 'ready' && config.setupScript !== null) {
      void prepareOnReady();
    }
  }, (message) => {
    show(failureElement(new RuntimeScriptError(message), ''));
  });

  const passesAllTests = async (files: Readonly<Record<string, string>>, testFile: string): Promise<boolean> => {
    try {
      const outcome = await runtime.runCode(files, testFile);
      return outcome.error === null && outcome.tests !== null && outcome.tests.length > 0
        && outcome.tests.every((test) => test.status === 'pass');
    } catch (error) {
      if (error instanceof RuntimeTimeoutError || error instanceof RuntimeScriptError) {
        await runtime.whenReady();
        return false;
      }
      throw error;
    }
  };

  const prepareFromScript = async (script: SetupScript): Promise<string | null> => {
    let files = script.files;
    let message: string | null = null;
    if (script.own !== null) {
      const saved = loadEdits(script.own.storageKey)[script.own.file];
      if (saved === undefined) {
        message = originMessages.missing;
      } else {
        const candidate = { ...script.files, [script.own.file]: saved };
        const passed = await passesAllTests(candidate, script.own.testFile);
        files = passed ? candidate : script.files;
        message = passed ? originMessages.own : originMessages.failing;
      }
    }
    let error = await runtime.setupScript(files, script.entry);
    if (error !== null && files !== script.files) {
      error = await runtime.setupScript(script.files, script.entry);
      message = originMessages.unbuildable;
    }
    if (error === null && message !== null) {
      origin.textContent = message;
      origin.hidden = false;
    }
    return error;
  };

  const prepare = async (): Promise<string | null> => {
    const error = config.setupScript === null
      ? await runtime.setupSql(config.setupSql ?? '')
      : await prepareFromScript(config.setupScript);
    if (error === null) {
      preparedGeneration = runtime.generation;
    }
    return error;
  };

  const showSetupError = (message: string): void => {
    show(
      element('div', { className: 'playground-error', attributes: { role: 'alert' } }, [
        element('p', { text: '最初の状態を作れませんでした' }),
        element('pre', { text: message }),
      ]),
    );
  };

  const guarded = async (action: () => Promise<void>): Promise<void> => {
    if (busy || runtime.state !== 'ready') {
      return;
    }
    busy = true;
    updateControls();
    try {
      await action();
    } catch (error) {
      showFailure(error);
    } finally {
      busy = false;
      updateControls();
    }
  };

  const prepareOnReady = (): Promise<void> =>
    guarded(async () => {
      const setupError = await prepare();
      if (setupError !== null) {
        showSetupError(setupError);
      }
    });

  const run = (): Promise<void> =>
    guarded(async () => {
      if (preparedGeneration !== runtime.generation) {
        const setupError = await prepare();
        if (setupError !== null) {
          showSetupError(setupError);
          return;
        }
      }
      show(...renderOutcome(await runtime.runSql(view.state.doc.toString())));
    });

  const reset = (): Promise<void> =>
    guarded(async () => {
      const setupError = await prepare();
      if (setupError === null) {
        show(element('p', { className: 'playground-note', text: 'データベースを最初の状態に戻しました' }));
      } else {
        showSetupError(setupError);
      }
    });

  const stateFor = (doc: string) =>
    createEditorState(doc, {
      language: 'sql',
      label: 'SQL を入力する欄',
      onRun: () => void run(),
      onChange: (text) => {
        backup = null;
        restoreButton.hidden = true;
        if (text === config.initialSql) {
          clearSql(config.storageId);
        } else {
          saveSql(config.storageId, text);
        }
      },
    });

  const view = createEditorView(
    query<HTMLElement>(root, '[data-role="editor"]'),
    stateFor(loadSql(config.storageId) ?? config.initialSql),
  );

  resetSqlButton.addEventListener('click', () => {
    const before = view.state.doc.toString();
    backup = before === config.initialSql ? null : before;
    restoreButton.hidden = backup === null;
    view.setState(stateFor(config.initialSql));
    clearSql(config.storageId);
  });
  restoreButton.addEventListener('click', () => {
    if (backup !== null) {
      view.setState(stateFor(backup));
      saveSql(config.storageId, backup);
    }
    backup = null;
    restoreButton.hidden = true;
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      backup = null;
      restoreButton.hidden = true;
      view.setState(stateFor(loadSql(config.storageId) ?? config.initialSql));
    }
  });
  runButton.addEventListener('click', () => void run());
  resetButton.addEventListener('click', () => void reset());
  retryButton.addEventListener('click', () => runtime.reload());
  updateControls();
};

for (const root of document.querySelectorAll<HTMLElement>('[data-playground="sql"]')) {
  if (!root.hidden) {
    mount(root);
    continue;
  }
  const observer = new MutationObserver(() => {
    if (!root.hidden) {
      observer.disconnect();
      mount(root);
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['hidden'] });
}
