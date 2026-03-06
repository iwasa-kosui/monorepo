import { useCallback, useRef, useState } from 'react';

type TranspilerState = {
  ready: boolean;
  loading: boolean;
};

export function useTypeScriptTranspiler() {
  const [state, setState] = useState<TranspilerState>({
    ready: false,
    loading: false,
  });
  const swcRef = useRef<typeof import('@swc/wasm-web') | null>(null);

  const initialize = useCallback(async () => {
    if (swcRef.current) return;
    setState({ ready: false, loading: true });
    const swc = await import('@swc/wasm-web');
    await swc.default();
    swcRef.current = swc;
    setState({ ready: true, loading: false });
  }, []);

  const transpile = useCallback(
    async (tsCode: string): Promise<{ code: string; error: string | null }> => {
      if (!swcRef.current) {
        await initialize();
      }
      const swc = swcRef.current;
      if (!swc) {
        return { code: '', error: 'SWC failed to initialize' };
      }

      try {
        const output = swc.transformSync(tsCode, {
          jsc: {
            parser: { syntax: 'typescript', tsx: false },
            target: 'es2020',
          },
          module: { type: 'es6' },
        });
        return { code: output.code, error: null };
      } catch (e) {
        return {
          code: '',
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
    [initialize],
  );

  return { ...state, transpile, initialize };
}
