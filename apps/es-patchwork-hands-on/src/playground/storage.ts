const prefix = 'es-patchwork-hands-on:code:';

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const loadEdits = (exerciseId: string): Record<string, string> => {
  try {
    const raw = storage()?.getItem(`${prefix}${exerciseId}`);
    const parsed: unknown = raw === null || raw === undefined ? null : JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
};

export const saveEdits = (exerciseId: string, edits: Readonly<Record<string, string>>): void => {
  try {
    storage()?.setItem(`${prefix}${exerciseId}`, JSON.stringify(edits));
  } catch {
    return;
  }
};

export const clearEdits = (exerciseId: string): void => {
  try {
    storage()?.removeItem(`${prefix}${exerciseId}`);
  } catch {
    return;
  }
};

const sqlPrefix = 'es-patchwork-hands-on:sql:';

export const loadSql = (id: string): string | null => {
  try {
    return storage()?.getItem(`${sqlPrefix}${id}`) ?? null;
  } catch {
    return null;
  }
};

export const saveSql = (id: string, sql: string): void => {
  try {
    storage()?.setItem(`${sqlPrefix}${id}`, sql);
  } catch {
    return;
  }
};

export const clearSql = (id: string): void => {
  try {
    storage()?.removeItem(`${sqlPrefix}${id}`);
  } catch {
    return;
  }
};

const questionPrefix = 'es-patchwork-hands-on:question:';

export const loadQuestion = (id: string): string | null => {
  try {
    return storage()?.getItem(`${questionPrefix}${id}`) ?? null;
  } catch {
    return null;
  }
};

export const saveQuestion = (id: string, question: string): boolean => {
  try {
    const target = storage();
    if (target === null) {
      return false;
    }
    target.setItem(`${questionPrefix}${id}`, question);
    return true;
  } catch {
    return false;
  }
};
