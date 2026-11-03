const KANA = /[぀-ヿ]/;

export const containsKana = (plainText: string): boolean => KANA.test(plainText);
