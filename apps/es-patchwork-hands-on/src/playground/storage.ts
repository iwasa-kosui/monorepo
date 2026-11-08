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
