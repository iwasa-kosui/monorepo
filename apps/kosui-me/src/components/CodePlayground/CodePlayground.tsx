import { useCallback, useEffect, useRef, useState } from 'react';

import { useQuickJS } from './useQuickJS';
import { useTypeScriptTranspiler } from './useTypeScriptTranspiler';

interface CodePlaygroundProps {
  code: string;
  lang?: 'javascript' | 'typescript';
  title?: string;
}

export function CodePlayground(
  { code: initialCode, lang = 'javascript', title }: CodePlaygroundProps,
) {
  const [output, setOutput] = useState<
    { logs: string[]; error: string | null } | null
  >(null);
  const [running, setRunning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<{ getValue: () => string } | null>(null);

  const quickJS = useQuickJS();
  const tsTranspiler = useTypeScriptTranspiler();

  const trimmedCode = initialCode.trim();

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
      });
      if (disposed) return;

      const editorEl = container.querySelector('.playground-editor');
      if (!editorEl) return;

      const editor = monaco.editor.create(editorEl as HTMLElement, {
        value: trimmedCode,
        language: lang,
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
        folding: false,
        glyphMargin: false,
        automaticLayout: true,
      });

      editorInstanceRef.current = { getValue: () => editor.getValue() };

      const updateHeight = () => {
        const contentHeight = editor.getContentHeight();
        (editorEl as HTMLElement).style.height = `${contentHeight}px`;
        editor.layout();
      };
      editor.onDidContentSizeChange(updateHeight);
      updateHeight();
    })();

    return () => {
      disposed = true;
    };
  }, [lang, trimmedCode]);

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
        <div
          className='playground-editor'
          style={{ minHeight: '120px' }}
        />
      </div>
      <div className='bg-[#161b22] border-t border-[#30363d] px-4 py-2 flex items-center gap-2'>
        <button
          type='button'
          onClick={handleRun}
          disabled={running}
          className='px-3 py-1 text-xs font-medium rounded-md bg-[#238636] text-white hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
        >
          {running ? '実行中...' : '実行'}
        </button>
        {(quickJS.loading || tsTranspiler.loading) && (
          <span className='text-xs text-[#8b949e]'>
            WASM読み込み中...
          </span>
        )}
      </div>
      {output && (
        <div className='bg-[#0d1117] border-t border-[#30363d] px-4 py-3 text-sm font-mono'>
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
        </div>
      )}
    </div>
  );
}
