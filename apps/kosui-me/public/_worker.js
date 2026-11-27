/**
 * OGP 画像（/og/*.png）を、はてなブックマークにだけ別の版で返す。
 *
 * はてなブックマークは og:image の中央を正方形に切り抜いて表示するので、
 * 文字を左に寄せた通常の画像では、タイトルの左側が切れる。
 * はてなのクローラー（User-Agent に Hatena を含む）には、文字を中央に寄せた
 * /og/hatena/ の同名の画像（scripts/generate-og-images.ts が作る）を返す。
 *
 * この Worker を通すパスは _routes.json で /og/* に限る。ほかのページは静的に配信される。
 */

const HATENA = /hatena/i;
const OG_IMAGE = /^\/og\/([^/]+\.png)$/;

/** どの版を返したかでキャッシュが混ざらないよう、Vary を付ける */
const varyByUserAgent = (response) => {
  const headers = new Headers(response.headers);
  headers.append('Vary', 'User-Agent');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

const isImage = (response) =>
  response.status === 304 || (response.ok && (response.headers.get('content-type') ?? '').startsWith('image/'));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const fileName = url.pathname.match(OG_IMAGE)?.[1];
    if (fileName === undefined) return env.ASSETS.fetch(request);

    if (HATENA.test(request.headers.get('user-agent') ?? '')) {
      const variant = await env.ASSETS.fetch(new Request(new URL(`/og/hatena/${fileName}`, url), request));
      // 無い画像を求めると 404 のページが返る。そのときは通常の画像を返す
      if (isImage(variant)) return varyByUserAgent(variant);
    }
    return varyByUserAgent(await env.ASSETS.fetch(request));
  },
};
