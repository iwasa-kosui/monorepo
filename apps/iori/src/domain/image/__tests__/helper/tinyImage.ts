const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** テスト用の、構造まで正しい 1x1 の PNG。メタデータを持たないので、取り除いても中身は変わらない */
export const tinyPng = (): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(TINY_PNG_BASE64), (char) => char.charCodeAt(0));
