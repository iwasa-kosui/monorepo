import type {
  TypecheckCompletion,
  TypecheckDiagnostic,
  TypecheckQuickInfo,
  TypecheckRequest,
  TypecheckResponse,
} from './protocol.ts';

export type TypecheckClient = {
  readonly diagnostics: (file: string, text: string) => Promise<TypecheckDiagnostic[] | null>;
  readonly completions: (
    file: string,
    text: string,
    position: number,
    trigger: string | null,
  ) => Promise<TypecheckCompletion[] | null>;
  readonly quickInfo: (file: string, text: string, position: number) => Promise<TypecheckQuickInfo | null>;
};

type Pending = { resolve: (response: TypecheckResponse | null) => void };

type Body<T extends Exclude<TypecheckRequest, { type: 'init' }>['type']> = Omit<
  Extract<TypecheckRequest, { type: T }>,
  'id'
>;

export const createTypecheckClient = (files: Readonly<Record<string, string>>): TypecheckClient => {
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let worker: Worker | null = null;

  const fail = (): void => {
    worker?.terminate();
    worker = null;
    for (const entry of pending.values()) {
      entry.resolve(null);
    }
    pending.clear();
  };

  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<TypecheckResponse>) => {
      const response = event.data;
      if (response.type === 'init-error') {
        fail();
        return;
      }
      if (response.type === 'ready') {
        return;
      }
      const entry = pending.get(response.id);
      pending.delete(response.id);
      entry?.resolve(response.type === 'error' ? null : response);
    });
    worker.addEventListener('error', fail);
    worker.addEventListener('messageerror', fail);
    worker.postMessage({ type: 'init', files: { ...files } } satisfies TypecheckRequest);
  } catch {
    fail();
  }

  const request = <T extends Exclude<TypecheckRequest, { type: 'init' }>['type']>(
    body: Body<T>,
  ): Promise<TypecheckResponse | null> => {
    const target = worker;
    if (target === null) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      nextId += 1;
      pending.set(nextId, { resolve });
      target.postMessage({ ...body, id: nextId });
    });
  };

  return {
    diagnostics: async (file, text) => {
      const response = await request<'diagnostics'>({ type: 'diagnostics', file, text });
      return response?.type === 'diagnostics' ? response.result : null;
    },
    completions: async (file, text, position, trigger) => {
      const response = await request<'completions'>({ type: 'completions', file, text, position, trigger });
      return response?.type === 'completions' ? response.result : null;
    },
    quickInfo: async (file, text, position) => {
      const response = await request<'quick-info'>({ type: 'quick-info', file, text, position });
      return response?.type === 'quick-info' ? response.result : null;
    },
  };
};
