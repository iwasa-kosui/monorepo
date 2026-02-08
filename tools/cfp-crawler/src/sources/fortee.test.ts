import { describe, expect, it } from 'vitest';

import { parseForteeHtml } from './fortee.js';

const card = (
  { slug, name, date, links }: {
    slug: string;
    name: string;
    date?: string;
    links?: string;
  },
) => `
<div class="col-md-4 conference">
  <div class="card">
    <div class="bg-placeholder-img card-img-top">
      <a href="/${slug}">
        <img src="/files/${slug}/image/banner.png" alt="${name}"/>
      </a>
    </div>
    <div class="card-body">
      <div class="term">${date ?? ''}</div>
      <a href="/${slug}" class="name">
        <h5 class="card-title">${name}</h5>
      </a>
      <ul class="links">${links ?? ''}</ul>
    </div>
  </div>
</div>`;

describe('parseForteeHtml', () => {
  it('should extract events with CFP links', () => {
    const html = card({
      slug: 'tskaigi-2026',
      name: 'TSKaigi 2026',
      date: '2026/05/10',
      links: `<li><a href="/tskaigi-2026/speaker/proposal/cfp">CFP応募中</a></li>`,
    });

    const result = parseForteeHtml(html);

    expect(result).toHaveLength(1);
    expect(result[0].conferenceName).toBe('TSKaigi 2026');
    expect(result[0].conferenceUrl).toBe('https://fortee.jp/tskaigi-2026');
    expect(result[0].cfpUrl).toBe(
      'https://fortee.jp/tskaigi-2026/speaker/proposal/cfp',
    );
    expect(result[0].conferenceDate).toEqual(new Date(2026, 4, 10));
    expect(result[0].source).toBe('fortee');
  });

  it('should extract Platform Engineering Kaigi', () => {
    const html = card({
      slug: 'platform-engineering-kaigi-2025',
      name: 'Platform Engineering Kaigi 2025',
      date: '2025/09/18',
      links: `
        <li><a href="https://www.cnia.io/pek2025/" target="_blank">公式サイト</a></li>
        <li><a href="/platform-engineering-kaigi-2025/speaker/proposal/cfp">CFP応募中</a></li>
      `,
    });

    const result = parseForteeHtml(html);

    expect(result).toHaveLength(1);
    expect(result[0].conferenceName).toBe('Platform Engineering Kaigi 2025');
    expect(result[0].conferenceUrl).toBe(
      'https://fortee.jp/platform-engineering-kaigi-2025',
    );
    expect(result[0].cfpUrl).toBe(
      'https://fortee.jp/platform-engineering-kaigi-2025/speaker/proposal/cfp',
    );
    expect(result[0].conferenceDate).toEqual(new Date(2025, 8, 18));
  });

  it('should handle events without CFP links', () => {
    const html = card({
      slug: 'some-event',
      name: 'Some Event 2026',
    });

    const result = parseForteeHtml(html);

    expect(result).toHaveLength(1);
    expect(result[0].cfpUrl).toBeNull();
  });

  it('should handle events without date information', () => {
    const html = card({
      slug: 'no-date-event',
      name: 'No Date Event',
    });

    const result = parseForteeHtml(html);

    expect(result).toHaveLength(1);
    expect(result[0].conferenceDate).toBeNull();
  });

  it('should extract multiple events', () => {
    const html = card({
      slug: 'event-a-2026',
      name: 'Event A 2026',
      date: '2026/03/01',
    }) + card({
      slug: 'event-b-2026',
      name: 'Event B 2026',
      date: '2026/06/15',
    });

    const result = parseForteeHtml(html);

    expect(result).toHaveLength(2);
    expect(result[0].conferenceName).toBe('Event A 2026');
    expect(result[1].conferenceName).toBe('Event B 2026');
  });

  it('should return empty array for HTML without conference cards', () => {
    const html = `<div><a href="/about">About</a></div>`;

    const result = parseForteeHtml(html);

    expect(result).toHaveLength(0);
  });
});
