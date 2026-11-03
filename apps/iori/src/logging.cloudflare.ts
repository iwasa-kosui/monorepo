import { configureSync, getConsoleSink } from '@logtape/logtape';
import { AsyncLocalStorage } from 'node:async_hooks';

configureSync({
  reset: true,
  contextLocalStorage: new AsyncLocalStorage(),
  sinks: {
    console: getConsoleSink(),
  },
  filters: {
    dropRequestHeaders: (record) => typeof record.properties.headers !== 'object' || record.properties.headers === null,
  },
  loggers: [
    // debug には署名や鍵の詳細が出るため info 以上に限る
    { category: [], lowestLevel: 'info', sinks: ['console'] },
    {
      category: ['fedify', 'sig', 'http'],
      lowestLevel: 'debug',
      sinks: ['console'],
      parentSinks: 'override',
      filters: ['dropRequestHeaders'],
    },
    { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['console'], parentSinks: 'override' },
  ],
});
