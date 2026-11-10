import { configureSync, getConsoleSink } from '@logtape/logtape';
import { AsyncLocalStorage } from 'node:async_hooks';

configureSync({
  reset: true,
  contextLocalStorage: new AsyncLocalStorage(),
  sinks: {
    console: getConsoleSink(),
  },
  filters: {},
  loggers: [
    // debug には署名や鍵の詳細が出るため info 以上に限る
    { category: [], lowestLevel: 'info', sinks: ['console'] },
    { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['console'], parentSinks: 'override' },
  ],
});
