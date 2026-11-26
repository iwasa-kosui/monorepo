import typescript from 'typescript';

import type { TypecheckRequest, TypecheckResponse } from './protocol.ts';
import { createTypecheckService, type TypecheckService } from './service.ts';

type Scope = {
  postMessage: (message: TypecheckResponse) => void;
  onmessage: ((event: MessageEvent<TypecheckRequest>) => void) | null;
};

const scope = self as unknown as Scope;

let service: TypecheckService | null = null;

const handle = (request: TypecheckRequest): TypecheckResponse => {
  if (request.type === 'init') {
    service = createTypecheckService(typescript, request.files);
    return { type: 'ready' };
  }
  if (service === null) {
    return { id: request.id, type: 'error', message: 'not initialized' };
  }
  switch (request.type) {
    case 'diagnostics':
      return { id: request.id, type: 'diagnostics', result: service.diagnostics(request.file, request.text) };
    case 'completions':
      return {
        id: request.id,
        type: 'completions',
        result: service.completions(request.file, request.text, request.position, request.trigger),
      };
    case 'quick-info':
      return {
        id: request.id,
        type: 'quick-info',
        result: service.quickInfo(request.file, request.text, request.position),
      };
  }
};

scope.onmessage = (event) => {
  const request = event.data;
  try {
    scope.postMessage(handle(request));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scope.postMessage(
      request.type === 'init' ? { type: 'init-error', message } : { id: request.id, type: 'error', message },
    );
  }
};
