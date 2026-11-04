import type { LanguageString } from '@fedify/vocab-runtime';

export type ContentWarning = Readonly<{
  summary: string | null;
  sensitive: boolean;
}>;

export type ContentWarningSource = Readonly<{
  summary: string | LanguageString | null;
  sensitive: boolean | null;
}>;

export const extractContentWarning = (note: ContentWarningSource): ContentWarning => {
  const summary = note.summary === null ? '' : String(note.summary);
  return {
    summary: summary === '' ? null : summary,
    sensitive: note.sensitive ?? false,
  };
};
