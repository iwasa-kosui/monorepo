import { configureSync, getConsoleSink } from '@logtape/logtape';
import { AsyncLocalStorage } from 'node:async_hooks';

configureSync({
  contextLocalStorage: new AsyncLocalStorage(),
  sinks: {
    console: getConsoleSink(),
  },
  filters: {},
  loggers: [
    { category: 'iori', lowestLevel: 'debug', sinks: ['console'] },
    { category: 'fedify', lowestLevel: 'info', sinks: ['console'] },
    { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['console'] },
  ],
});
