import type { TrendCandidate } from './digestMaterial.ts';

export type DigestBodyRadar = Readonly<{ title: string; url: string }>;
export type DigestBodyEntry = Readonly<{
  title: string;
  url: string;
  summary: string | null;
  hatenaBookmarkCount: number | null;
}>;

export type DigestBodyReason = Readonly<{
  scope: 'kosui' | 'own';
  label: string;
  url?: string;
}>;
export type DigestBodyRecommendation = Readonly<{
  title: string;
  url: string;
  summary: string | null;
  fromHatena: boolean;
  reason: DigestBodyReason | null;
}>;

export type DigestBodyInput = Readonly<{
  radar: DigestBodyRadar | undefined;
  entries: ReadonlyArray<DigestBodyEntry>;
  recommendations?: ReadonlyArray<DigestBodyRecommendation>;
  timelineTrends: ReadonlyArray<TrendCandidate>;
  hatenaTrends: ReadonlyArray<TrendCandidate>;
}>;

export type DigestBodies = Readonly<{ privateHtml: string; publicHtml: string }>;

const EMPTY_HTML = '<p>今日のダイジェストに載せる記事はありません。</p>';

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');

const toHttpHref = (url: string): string | undefined => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
};

const link = (title: string, url: string): string => {
  const href = toHttpHref(url);
  return href === undefined ? escapeHtml(title) : `<a href="${escapeHtml(href)}">${escapeHtml(title)}</a>`;
};

const section = (heading: string, items: ReadonlyArray<string>): string =>
  items.length === 0
    ? ''
    : `<h2>${escapeHtml(heading)}</h2><ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;

const radarSection = (radar: DigestBodyRadar | undefined): string =>
  radar === undefined ? '' : section('Thoughtworks Technology Radar の新しい版', [link(radar.title, radar.url)]);

const entriesSection = (entries: ReadonlyArray<DigestBodyEntry>, showHatenaCount: boolean): string =>
  section(
    '新着',
    entries.map((entry) => {
      const count = showHatenaCount && entry.hatenaBookmarkCount !== null
        ? `（はてなブックマーク ${entry.hatenaBookmarkCount}）`
        : '';
      const summary = entry.summary === null ? '' : `<br>${escapeHtml(entry.summary).replaceAll('\n', '<br>')}`;
      return `${link(entry.title, entry.url)}${count}${summary}`;
    }),
  );

const recommendationsSection = (
  recommendations: ReadonlyArray<DigestBodyRecommendation>,
  isPublic: boolean,
): string =>
  section(
    'あなたへのおすすめ',
    recommendations
      .filter((recommendation) => !isPublic || !recommendation.fromHatena)
      .map(({ title, url, summary, reason }) => {
        const summaryHtml = summary === null ? '' : `<br>${escapeHtml(summary).replaceAll('\n', '<br>')}`;
        const reasonHtml = reason === null || (isPublic && reason.scope === 'own')
          ? ''
          : `<br>関心の根拠: ${reason.url === undefined ? escapeHtml(reason.label) : link(reason.label, reason.url)}`;
        return `${link(title, url)}${summaryHtml}${reasonHtml}`;
      }),
  );

const trendsSection = (heading: string, trends: ReadonlyArray<TrendCandidate>, unit: string): string =>
  section(
    heading,
    trends.map((trend) => `${link(trend.title, trend.url)}${trend.count > 0 ? `（${trend.count} ${unit}）` : ''}`),
  );

const join = (sections: ReadonlyArray<string>): string => {
  const html = sections.join('');
  return html === '' ? EMPTY_HTML : html;
};

export const buildDigestBodies = ({
  radar,
  entries,
  recommendations = [],
  timelineTrends,
  hatenaTrends,
}: DigestBodyInput): DigestBodies => ({
  privateHtml: join([
    radarSection(radar),
    recommendationsSection(recommendations, false),
    entriesSection(entries, true),
    trendsSection('みんなの関心（iori のタイムライン）', timelineTrends, '人が共有'),
    trendsSection('みんなの関心（はてなブックマーク）', hatenaTrends, 'ブックマーク'),
  ]),
  publicHtml: join([
    radarSection(radar),
    recommendationsSection(recommendations, true),
    entriesSection(entries, false),
  ]),
});
