import { useCallback, useEffect, useRef, useState } from 'react';

import { useQuickJS } from './useQuickJS';
import { useTypeScriptTranspiler } from './useTypeScriptTranspiler';

let nextInstanceId = 0;

interface CodePlaygroundProps {
  code: string;
  lang?: 'javascript' | 'typescript';
  title?: string;
  collapsedRanges?: [number, number][];
}

export function CodePlayground(
  { code: initialCode, lang = 'javascript', title, collapsedRanges }: CodePlaygroundProps,
) {
  const instanceIdRef = useRef<number | null>(null);
  if (instanceIdRef.current === null) {
    instanceIdRef.current = nextInstanceId++;
  }
  const [output, setOutput] = useState<
    { logs: string[]; error: string | null } | null
  >(null);
  const [running, setRunning] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [typeErrors, setTypeErrors] = useState<
    { message: string; startLineNumber: number; startColumn: number }[]
  >([]);
  const [activeTab, setActiveTab] = useState<'output' | 'problems'>('output');
  const containerRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<{ getValue: () => string } | null>(null);

  const quickJS = useQuickJS();
  const tsTranspiler = useTypeScriptTranspiler();

  // WASMモジュールをプリロードして初回実行時の待ち時間を削減
  useEffect(() => {
    quickJS.initialize();
    if (lang === 'typescript') {
      tsTranspiler.initialize();
    }
  }, [quickJS.initialize, tsTranspiler.initialize, lang]);

  const trimmedCode = initialCode.trim();

  // Highlight the fallback code block with Shiki (async, client-side)
  useEffect(() => {
    const el = fallbackRef.current;
    if (!el || editorReady) return;
    let cancelled = false;

    (async () => {
      const { codeToHtml } = await import('shiki');
      if (cancelled || editorReady) return;
      const html = await codeToHtml(trimmedCode, {
        lang,
        theme: 'github-dark',
      });
      if (cancelled || editorReady) return;
      el.innerHTML = html;
    })();

    return () => {
      cancelled = true;
    };
  }, [trimmedCode, lang, editorReady]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;

    (async () => {
      const { init } = await import('modern-monaco');
      if (disposed) return;

      const monaco = await init({
        defaultTheme: 'github-dark',
        langs: [lang],
        lsp: lang === 'typescript'
          ? {
            typescript: {
              compilerOptions: {
                strict: true,
                target: 99,
                module: 99,
              },
            },
          }
          : undefined,
      });
      if (disposed) return;

      const editorEl = container.querySelector('.playground-editor');
      if (!editorEl) return;

      const ext = lang === 'typescript' ? 'ts' : 'js';
      const fileUri = monaco.Uri.parse(`file:///playground-${instanceIdRef.current}.${ext}`);
      const model = monaco.editor.getModel(fileUri)
        ?? monaco.editor.createModel(trimmedCode, lang, fileUri);

      const editor = monaco.editor.create(editorEl as HTMLElement, {
        model,
        minimap: { enabled: false },
        lineNumbers: 'off',
        scrollBeyondLastLine: false,
        fontSize: 14,
        padding: { top: 16, bottom: 16 },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        scrollbar: {
          vertical: 'hidden',
          horizontal: 'auto',
        },
        renderLineHighlight: 'none',
        folding: !!collapsedRanges?.length,
        showFoldingControls: collapsedRanges?.length ? 'always' : 'never',
        glyphMargin: false,
        automaticLayout: true,
      });

      editorInstanceRef.current = { getValue: () => editor.getValue() };

      if (collapsedRanges?.length) {
        monaco.languages.registerFoldingRangeProvider(lang, {
          provideFoldingRanges(m) {
            if (m.uri.toString() !== fileUri.toString()) return [];
            return collapsedRanges.map(([start, end]) => ({
              start,
              end,
              kind: monaco.languages.FoldingRangeKind.Region,
            }));
          },
        });
        // Fold after folding ranges are computed
        setTimeout(() => {
          for (const [start] of collapsedRanges) {
            editor.setPosition({ lineNumber: start, column: 1 });
            editor.trigger('api', 'editor.fold', {});
          }
          editor.setPosition({ lineNumber: 1, column: 1 });
        }, 200);
      }

      const updateHeight = () => {
        const contentHeight = editor.getContentHeight();
        (editorEl as HTMLElement).style.height = `${contentHeight}px`;
        editor.layout();
      };
      editor.onDidContentSizeChange(updateHeight);
      updateHeight();

      if (lang === 'typescript') {
        const editorModel = editor.getModel();
        if (editorModel) {
          monaco.editor.onDidChangeMarkers(([resource]) => {
            if (resource.toString() === editorModel.uri.toString()) {
              const markers = monaco.editor.getModelMarkers({
                resource: editorModel.uri,
              });
              setTypeErrors(
                markers
                  .filter((m) => m.severity === monaco.MarkerSeverity.Error)
                  .map((m) => ({
                    message: m.message,
                    startLineNumber: m.startLineNumber,
                    startColumn: m.startColumn,
                  })),
              );
            }
          });
        }
      }

      setEditorReady(true);
    })();

    return () => {
      disposed = true;
    };
  }, [lang, trimmedCode, collapsedRanges]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setOutput(null);
    try {
      const currentCode = editorInstanceRef.current?.getValue() ?? trimmedCode;
      let jsCode = currentCode;
      if (lang === 'typescript') {
        const { code: transpiled, error } = await tsTranspiler.transpile(
          currentCode,
        );
        if (error) {
          setOutput({ logs: [], error: `Transpile error: ${error}` });
          return;
        }
        jsCode = transpiled;
      }
      const result = await quickJS.evalCode(jsCode);
      setOutput(result);
    } finally {
      setRunning(false);
    }
  }, [lang, trimmedCode, quickJS, tsTranspiler]);

  return (
    <div className='my-4 rounded-2xl overflow-hidden border border-[#30363d]'>
      {title && (
        <div className='bg-[#161b22] px-4 py-2 text-xs text-[#8b949e] border-b border-[#30363d] flex items-center justify-between'>
          <span>{title}</span>
          <span className='text-[#6e7681]'>
            {lang === 'typescript' ? 'TypeScript' : 'JavaScript'}
          </span>
        </div>
      )}
      <div ref={containerRef}>
        {!editorReady && (
          <div
            ref={fallbackRef}
            className='[&_pre]:m-0 [&_pre]:px-4 [&_pre]:py-4 [&_pre]:overflow-x-auto [&_pre]:bg-[#0d1117] [&_code]:text-sm'
          >
            <pre className='bg-[#0d1117] m-0 px-4 py-4 overflow-x-auto'>
              <code className='text-[#c9d1d9] text-sm font-mono'>{trimmedCode}</code>
            </pre>
          </div>
        )}
        <div
          className='playground-editor'
          style={editorReady ? undefined : { height: 0, overflow: 'hidden' }}
        />
      </div>
      <div className='bg-[#161b22] border-t border-[#30363d] flex items-center'>
        <div className='flex'>
          <button
            type='button'
            onClick={() => setActiveTab('output')}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'output'
                ? 'text-[#e6edf3] border-[#f78166]'
                : 'text-[#8b949e] border-transparent hover:text-[#e6edf3]'
            }`}
          >
            出力
          </button>
          {lang === 'typescript' && (
            <button
              type='button'
              onClick={() => setActiveTab('problems')}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'problems'
                  ? 'text-[#e6edf3] border-[#f78166]'
                  : 'text-[#8b949e] border-transparent hover:text-[#e6edf3]'
              }`}
            >
              問題
              {editorReady && (
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                    typeErrors.length > 0
                      ? 'bg-[#f85149] text-white'
                      : 'bg-[#238636] text-white'
                  }`}
                >
                  {typeErrors.length}
                </span>
              )}
            </button>
          )}
        </div>
        <div className='ml-auto pr-2 flex items-center gap-2'>
          {(quickJS.loading || tsTranspiler.loading) && (
            <span className='text-xs text-[#8b949e]'>
              WASM読み込み中...
            </span>
          )}
          <button
            type='button'
            onClick={handleRun}
            disabled={running}
            className='px-3 py-1 text-xs font-medium rounded-md bg-[#238636] text-white hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
          >
            {running ? '実行中...' : '▶ 実行'}
          </button>
        </div>
      </div>
      <div className='bg-[#0d1117] px-4 py-3 text-sm font-mono min-h-[60px] max-h-[200px] overflow-y-auto'>
        {activeTab === 'output'
          ? (
            output
              ? (
                <>
                  {output.logs.map((log, i) => (
                    <div key={i} className='text-[#c9d1d9] whitespace-pre-wrap'>
                      {log}
                    </div>
                  ))}
                  {output.error && (
                    <div className='text-[#f85149] whitespace-pre-wrap'>
                      {output.error}
                    </div>
                  )}
                  {output.logs.length === 0 && !output.error && (
                    <div className='text-[#6e7681] italic'>
                      (出力なし)
                    </div>
                  )}
                </>
              )
              : (
                <div className='text-[#6e7681] italic'>
                  ▶ 実行ボタンを押してください
                </div>
              )
          )
          : (
            typeErrors.length > 0
              ? (
                typeErrors.map((err, i) => (
                  <div key={i} className='flex items-start gap-2 py-0.5'>
                    <span className='text-[#f85149] shrink-0'>●</span>
                    <span className='text-[#8b949e] shrink-0'>
                      ({err.startLineNumber},{err.startColumn})
                    </span>
                    <span className='text-[#c9d1d9]'>{err.message}</span>
                  </div>
                ))
              )
              : (
                <div className='text-[#8b949e]'>
                  型エラーはありません
                </div>
              )
          )}
      </div>
    </div>
  );
}
