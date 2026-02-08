import { err, ok, Result } from '@iwasa-kosui/result';
import { parse } from 'node-html-parser';

import { CfpEntry } from '../types.js';

const FORTEE_URL = 'https://fortee.jp/';
const FETCH_TIMEOUT_MS = 10_000;

export const fetchFortee = async (): Promise<Result<readonly CfpEntry[], Error>> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(FORTEE_URL, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return err(new Error(`HTTP ${response.status}: ${response.statusText}`));
    }

    const html = await response.text();
    const entries = parseForteeHtml(html);
    return ok(entries);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
};

export const parseForteeHtml = (html: string): readonly CfpEntry[] => {
  const root = parse(html);
  const cards = root.querySelectorAll('.conference .card');

  return cards.flatMap((card): CfpEntry[] => {
    // イベント名を .card-title または a.name から取得
    const nameEl = card.querySelector('.card-title') ?? card.querySelector('a.name');
    const name = nameEl?.textContent?.trim();
    if (!name || name.length < 3) return [];

    // イベントslugを a[href] から取得
    const slugLink = card.querySelector('a[href^="/"]');
    const eventSlug = slugLink?.getAttribute('href');
    if (!eventSlug || eventSlug === '/') return [];

    const conferenceUrl = `https://fortee.jp${eventSlug}`;

    // CFPリンクを検出
    const allLinks = card.querySelectorAll('a[href]');
    const cfpLink = allLinks.find((a) => {
      const href = a.getAttribute('href') ?? '';
      return href.includes('/speaker/proposal/cfp');
    });
    const cfpUrl = cfpLink
      ? `https://fortee.jp${cfpLink.getAttribute('href')}`
      : null;

    // 日付情報を .term から取得
    const termEl = card.querySelector('.term');
    const termText = termEl?.textContent?.trim() ?? '';
    const dateMatch = termText.match(/(\d{4})[./年-](\d{1,2})[./月-](\d{1,2})/);
    const conferenceDate = dateMatch
      ? new Date(
        parseInt(dateMatch[1]),
        parseInt(dateMatch[2]) - 1,
        parseInt(dateMatch[3]),
      )
      : null;

    return [{
      conferenceName: name,
      cfpUrl,
      conferenceUrl,
      cfpDeadline: null,
      conferenceDate,
      location: null,
      source: 'fortee',
    }];
  });
};
