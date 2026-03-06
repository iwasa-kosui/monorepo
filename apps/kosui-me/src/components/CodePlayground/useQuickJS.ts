import { useCallback, useRef, useState } from 'react';

type ExecutionResult = {
  logs: string[];
  error: string | null;
};

type QuickJSState = {
  ready: boolean;
  loading: boolean;
};

export function useQuickJS() {
  const [state, setState] = useState<QuickJSState>({
    ready: false,
    loading: false,
  });
  const quickJSRef = useRef<
    Awaited<
      ReturnType<typeof import('quickjs-emscripten').getQuickJS>
    > | null
  >(null);

  const initialize = useCallback(async () => {
    if (quickJSRef.current) return;
    setState({ ready: false, loading: true });
    const { newQuickJSWASMModuleFromVariant } = await import('quickjs-emscripten');
    const variant = await import('@jitl/quickjs-singlefile-browser-release-sync');
    quickJSRef.current = await newQuickJSWASMModuleFromVariant(variant.default);
    setState({ ready: true, loading: false });
  }, []);

  const evalCode = useCallback(
    async (code: string): Promise<ExecutionResult> => {
      if (!quickJSRef.current) {
        await initialize();
      }
      const quickJS = quickJSRef.current;
      if (!quickJS) {
        return { logs: [], error: 'QuickJS failed to initialize' };
      }

      const logs: string[] = [];
      const vm = quickJS.newContext();

      try {
        const consoleHandle = vm.newObject();
        const logFn = vm.newFunction('log', (...args) => {
          const parts = args.map((arg) => {
            const str = vm.dump(arg);
            if (typeof str === 'string') return str;
            try {
              return JSON.stringify(str, null, 2);
            } catch {
              return String(str);
            }
          });
          logs.push(parts.join(' '));
        });
        vm.setProp(consoleHandle, 'log', logFn);

        const warnFn = vm.newFunction('warn', (...args) => {
          const parts = args.map((arg) => {
            const str = vm.dump(arg);
            if (typeof str === 'string') return str;
            try {
              return JSON.stringify(str, null, 2);
            } catch {
              return String(str);
            }
          });
          logs.push(`[warn] ${parts.join(' ')}`);
        });
        vm.setProp(consoleHandle, 'warn', warnFn);

        const errorFn = vm.newFunction('error', (...args) => {
          const parts = args.map((arg) => {
            const str = vm.dump(arg);
            if (typeof str === 'string') return str;
            try {
              return JSON.stringify(str, null, 2);
            } catch {
              return String(str);
            }
          });
          logs.push(`[error] ${parts.join(' ')}`);
        });
        vm.setProp(consoleHandle, 'error', errorFn);

        vm.setProp(vm.global, 'console', consoleHandle);
        consoleHandle.dispose();
        logFn.dispose();
        warnFn.dispose();
        errorFn.dispose();

        const result = vm.evalCode(code);
        if (result.error) {
          const errorObj = vm.dump(result.error);
          result.error.dispose();
          const errorMessage = typeof errorObj === 'object' && errorObj !== null
            ? (errorObj as { message?: string }).message
              ?? JSON.stringify(errorObj)
            : String(errorObj);
          return { logs, error: errorMessage };
        }
        result.value.dispose();
        return { logs, error: null };
      } finally {
        vm.dispose();
      }
    },
    [initialize],
  );

  return { ...state, evalCode, initialize };
}
