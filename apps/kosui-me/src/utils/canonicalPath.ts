/**
 * build.format が 'file' のとき、Astro はビルド時の pathname を出力ファイル名（/about.html, /index.html）で返す。
 * 公開される URL は拡張子なしで、.html 付きの URL はそこへリダイレクトされるので、canonical には拡張子なしのパスを使う。
 */
export const toCanonicalPath = (pathname: string): string =>
  pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
