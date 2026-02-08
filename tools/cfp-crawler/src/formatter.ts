import { CfpEntry } from './types.js';

export const formatMarkdown = (entries: readonly CfpEntry[]): string => {
  const now = new Date();
  const timestamp = formatTimestamp(now);

  const withCfp = entries
    .filter((e) => e.cfpUrl !== null)
    .sort((a, b) => {
      if (a.cfpDeadline && b.cfpDeadline) {
        return a.cfpDeadline.getTime() - b.cfpDeadline.getTime();
      }
      if (a.cfpDeadline) return -1;
      if (b.cfpDeadline) return 1;
      return 0;
    });

  const withoutCfp = entries
    .filter((e) => e.cfpUrl === null)
    .sort((a, b) => {
      if (a.conferenceDate && b.conferenceDate) {
        return a.conferenceDate.getTime() - b.conferenceDate.getTime();
      }
      if (a.conferenceDate) return -1;
      if (b.conferenceDate) return 1;
      return 0;
    });

  const lines: string[] = [];
  lines.push('# CFP情報一覧');
  lines.push('');
  lines.push(`> 取得日時: ${timestamp}`);
  lines.push('');

  if (withCfp.length > 0) {
    lines.push('## CFP募集中');
    lines.push('');
    lines.push('| カンファレンス | CFP締切 | 開催日 | 場所 | 情報源 |');
    lines.push('|---|---|---|---|---|');
    for (const entry of withCfp) {
      const name = `[${escapeMarkdown(entry.conferenceName)}](${entry.cfpUrl ?? entry.conferenceUrl})`;
      const deadline = entry.cfpDeadline ? formatDate(entry.cfpDeadline) : '-';
      const date = entry.conferenceDate ? formatDate(entry.conferenceDate) : '-';
      const location = entry.location ?? '-';
      lines.push(`| ${name} | ${deadline} | ${date} | ${location} | ${entry.source} |`);
    }
    lines.push('');
  }

  if (withoutCfp.length > 0) {
    lines.push('## その他のカンファレンス');
    lines.push('');
    lines.push('| カンファレンス | 開催日 | 場所 | 情報源 |');
    lines.push('|---|---|---|---|');
    for (const entry of withoutCfp) {
      const name = `[${escapeMarkdown(entry.conferenceName)}](${entry.conferenceUrl})`;
      const date = entry.conferenceDate ? formatDate(entry.conferenceDate) : '-';
      const location = entry.location ?? '-';
      lines.push(`| ${name} | ${date} | ${location} | ${entry.source} |`);
    }
    lines.push('');
  }

  if (withCfp.length === 0 && withoutCfp.length === 0) {
    lines.push('該当するカンファレンス情報はありませんでした。');
    lines.push('');
  }

  return lines.join('\n');
};

const formatDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatTimestamp = (date: Date): string => {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const minutes = String(absOffset % 60).padStart(2, '0');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${
    String(date.getDate()).padStart(2, '0')
  }T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${
    String(date.getSeconds()).padStart(2, '0')
  }${sign}${hours}:${minutes}`;
};

const escapeMarkdown = (text: string): string => {
  return text.replace(/\|/g, '\\|').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
};
