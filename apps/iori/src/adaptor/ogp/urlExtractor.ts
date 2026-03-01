/**
 * HTMLコンテンツからURLを抽出するユーティリティ
 */

const URL_REGEX = /href=["']?(https?:\/\/[^"'\s>]+)["']?/gi;
const MAX_URLS = 3;

/**
 * HTMLコンテンツからaタグのhref属性を抽出する
 * @param html HTMLコンテンツ
 * @param excludeHost 除外するホスト名（同一ドメインのURLを除外）
 * @returns 抽出されたURL配列（最大3件）
 */
export const extractUrlsFromHtml = (html: string, excludeHost?: string): string[] => {
  const urls: string[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = URL_REGEX.exec(html)) !== null) {
    const url = match[1];
    if (!url || seen.has(url)) continue;

    try {
      const parsedUrl = new URL(url);

      // 除外ホストと一致する場合はスキップ
      if (excludeHost && parsedUrl.host === excludeHost) continue;

      // 画像・動画・音声ファイルは除外
      const ext = parsedUrl.pathname.split('.').pop()?.toLowerCase();
      if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mp3', 'wav'].includes(ext)) {
        continue;
      }

      seen.add(url);
      urls.push(url);

      if (urls.length >= MAX_URLS) break;
    } catch {
      // 無効なURLはスキップ
      continue;
    }
  }

  // 正規表現のlastIndexをリセット
  URL_REGEX.lastIndex = 0;

  return urls;
};
