export type HomeNavClick = Readonly<{
  /** 押されたリンクの URL。リンク以外が押されたときは undefined。 */
  href: string | undefined;
  /** いま開いているページの URL。 */
  currentHref: string;
  button: number;
  hasModifier: boolean;
}>;

/**
 * ホームを開いているときにナビのホームボタンが押されたかを判定する。
 * 真のときはページを読み直さず、先頭（最新の投稿）までスクロールする。
 * 新しいタブで開く操作や、投稿モーダルなどハッシュ付きの状態からの遷移は、ブラウザの既定の動作に任せる。
 */
export const isHomeNavClickOnHome = ({ href, currentHref, button, hasModifier }: HomeNavClick): boolean => {
  if (href === undefined || button !== 0 || hasModifier) return false;
  try {
    const target = new URL(href);
    const current = new URL(currentHref);
    const isHome = (url: URL) => url.pathname === '/' && url.search === '' && url.hash === '';
    return target.origin === current.origin && isHome(target) && isHome(current);
  } catch {
    return false;
  }
};
