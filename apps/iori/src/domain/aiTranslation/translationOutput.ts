export const UNDETERMINED_LANGUAGE = 'und';

export type TranslationOutput = Readonly<{ detectedSourceLanguage: string; text: string }>;

const LANGUAGE_LINE = /^\s*\[\[lang:\s*([A-Za-z]{2,3})\s*\]\]\s*/;

export const parseTranslationOutput = (output: string): TranslationOutput => {
  const match = LANGUAGE_LINE.exec(output);
  if (match === null) return { detectedSourceLanguage: UNDETERMINED_LANGUAGE, text: output.trim() };
  return {
    detectedSourceLanguage: match[1]!.toLowerCase(),
    text: output.slice(match[0].length).trim(),
  };
};
