// 排他制御の port。tryRun が false を返した場合は他のプロセスが既に保持していることを意味する。
export type LockPort = Readonly<{
  tryRun: (fn: () => void) => boolean;
}>;
