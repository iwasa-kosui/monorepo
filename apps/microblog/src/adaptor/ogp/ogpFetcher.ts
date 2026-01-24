/**
 * OGP（Open Graph Protocol）情報を取得するフェッチャー
 */

export type OgpData = Readonly<{
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  siteName: string | null;
}>;

export type OgpFetcher = Readonly<{
  fetch: (url: string) => Promise<OgpData>;
}>;

const FETCH_TIMEOUT_MS = 5000;

const emptyOgpData: OgpData = {
  title: null,
  description: null,
  imageUrl: null,
  faviconUrl: null,
  siteName: null,
};

/**
 * メタタグから指定されたプロパティの値を抽出する
 */
const extractMetaContent = (html: string, property: string): string | null => {
  // og:xxx または twitter:xxx 形式のメタタグを検索
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1]);
    }
  }
  return null;
};

/**
 * titleタグから値を抽出する
 */
const extractTitle = (html: string): string | null => {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null;
};

/**
 * faviconのURLを抽出する
 */
const extractFaviconUrl = (html: string, baseUrl: string): string | null => {
  // link rel="icon" を検索
  const patterns = [
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return resolveUrl(match[1], baseUrl);
    }
  }

  // デフォルトで /favicon.ico を返す
  try {
    const url = new URL(baseUrl);
    return `${url.origin}/favicon.ico`;
  } catch {
    return null;
  }
};

/**
 * 相対URLを絶対URLに解決する
 */
const resolveUrl = (url: string, baseUrl: string): string => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
};

/**
 * HTMLエンティティをデコードする
 */
const decodeHtmlEntities = (text: string): string => {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&#x27;/g, '\'')
    .replace(/&#x2F;/g, '/');
};

/**
 * OGPフェッチャーのインスタンスを作成する
 */
export const createOgpFetcher = (): OgpFetcher => {
  const fetchOgp = async (url: string): Promise<OgpData> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MicroblogBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`OGP fetch failed for ${url}: HTTP ${response.status}`);
        return emptyOgpData;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        return emptyOgpData;
      }

      const html = await response.text();

      // OGP情報を抽出
      const ogTitle = extractMetaContent(html, 'og:title');
      const ogDescription = extractMetaContent(html, 'og:description');
      const ogImage = extractMetaContent(html, 'og:image');
      const ogSiteName = extractMetaContent(html, 'og:site_name');

      // Twitter Card情報をフォールバックとして使用
      const twitterTitle = extractMetaContent(html, 'twitter:title');
      const twitterDescription = extractMetaContent(html, 'twitter:description');
      const twitterImage = extractMetaContent(html, 'twitter:image');

      // 通常のメタタグもフォールバック
      const metaDescription = extractMetaContent(html, 'description');
      const htmlTitle = extractTitle(html);

      // favicon
      const faviconUrl = extractFaviconUrl(html, url);

      // 画像URLを絶対URLに解決
      const imageUrl = ogImage ?? twitterImage;
      const resolvedImageUrl = imageUrl ? resolveUrl(imageUrl, url) : null;

      return {
        title: ogTitle ?? twitterTitle ?? htmlTitle,
        description: ogDescription ?? twitterDescription ?? metaDescription,
        imageUrl: resolvedImageUrl,
        faviconUrl,
        siteName: ogSiteName,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`OGP fetch timeout for ${url}`);
      } else {
        console.warn(`OGP fetch error for ${url}:`, error);
      }
      return emptyOgpData;
    }
  };

  return {
    fetch: fetchOgp,
  };
};
