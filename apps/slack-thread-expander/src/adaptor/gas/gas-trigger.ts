// 1 分毎の時間トリガーを `main` 関数に紐付ける／解除する GAS adaptor。
const HANDLER_FUNCTION = 'main';
const INTERVAL_MINUTES = 1;

export const GasTrigger = {
  install: (): void => {
    for (const trigger of ScriptApp.getProjectTriggers()) {
      if (trigger.getHandlerFunction() === HANDLER_FUNCTION) {
        ScriptApp.deleteTrigger(trigger);
      }
    }
    ScriptApp.newTrigger(HANDLER_FUNCTION).timeBased().everyMinutes(
      INTERVAL_MINUTES,
    ).create();
  },
  uninstall: (): void => {
    for (const trigger of ScriptApp.getProjectTriggers()) {
      if (trigger.getHandlerFunction() === HANDLER_FUNCTION) {
        ScriptApp.deleteTrigger(trigger);
      }
    }
  },
} as const;
