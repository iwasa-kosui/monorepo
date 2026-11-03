import { configureSync, getConsoleSink } from '@logtape/logtape';
import { AsyncLocalStorage } from 'node:async_hooks';

configureSync({
  reset: true,
  contextLocalStorage: new AsyncLocalStorage(),
  sinks: {
    console: getConsoleSink(),
  },
  filters: {
    onlyDoubleKnockingDebug: (record) =>
      record.level !== 'debug' || ('spec' in record.properties && 'secondSpec' in record.properties),
  },
  loggers: [
    // debug には署名や鍵の詳細が出るため info 以上に限る
    { category: [], lowestLevel: 'info', sinks: ['console'] },
    // relay への Follow の 400 を切り分ける間だけ debug にする（#585 の配備から 1 週間以内に戻す）
    {
      category: ['fedify', 'sig', 'http'],
      lowestLevel: 'debug',
      sinks: ['console'],
      parentSinks: 'override',
      filters: ['onlyDoubleKnockingDebug'],
    },
    { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['console'], parentSinks: 'override' },
  ],
});
