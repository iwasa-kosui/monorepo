import { describe, expect, it } from 'vitest';

import { extractEvents, extractRscText, parseFindyConferenceHtml } from './findyConference.js';

const rscPush = (content: string): string => {
  // Simulate self.__next_f.push([1, "..."]) by JSON-escaping the content
  const escaped = JSON.stringify(content).slice(1, -1);
  return `<script>self.__next_f.push([1,"${escaped}"])</script>`;
};

const eventJson = (overrides: Record<string, unknown> = {}): string => {
  return JSON.stringify({
    id: 1,
    pagePath: '/events/test-conf-2026/1',
    headerImage: null,
    cfpRegistrationStatus: null,
    participationRegistrationStatus: null,
    sponsorRegistrationStatus: null,
    name: 'Test Conference 2026',
    startAt: '2026-05-10T00:00:00+09:00',
    eventCategories: [],
    ...overrides,
  });
};

describe('extractRscText', () => {
  it('should extract and unescape self.__next_f.push content', () => {
    const html = `<html><script>self.__next_f.push([1,"hello \\"world\\""])</script></html>`;

    const result = extractRscText(html);

    expect(result).toBe('hello "world"');
  });

  it('should concatenate multiple push chunks', () => {
    const html = [
      `<script>self.__next_f.push([1,"chunk1"])</script>`,
      `<script>self.__next_f.push([1,"chunk2"])</script>`,
    ].join('');

    const result = extractRscText(html);

    expect(result).toBe('chunk1chunk2');
  });

  it('should handle unicode escapes', () => {
    const html = `<script>self.__next_f.push([1,"\\u30bb\\u30ad\\u30e5\\u30ea\\u30c6\\u30a3"])</script>`;

    const result = extractRscText(html);

    expect(result).toBe('セキュリティ');
  });

  it('should return empty string for HTML without push calls', () => {
    const html = '<html><body>No RSC data</body></html>';

    const result = extractRscText(html);

    expect(result).toBe('');
  });
});

describe('extractEvents', () => {
  it('should extract event from RSC text', () => {
    const text = `["$","div",null,{"events":{"list":[${eventJson()}]}}]`;

    const result = extractEvents(text);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Test Conference 2026');
    expect(result[0].pagePath).toBe('/events/test-conf-2026/1');
    expect(result[0].cfpRegistrationStatus).toBeNull();
  });

  it('should extract event with CFP registration open', () => {
    const text = `[${eventJson({ cfpRegistrationStatus: 'started' })}]`;

    const result = extractEvents(text);

    expect(result).toHaveLength(1);
    expect(result[0].cfpRegistrationStatus).toBe('started');
  });

  it('should extract multiple events', () => {
    const text = `[${eventJson({ id: 1, pagePath: '/events/event-a/1', name: 'Event A' })},${
      eventJson({ id: 2, pagePath: '/events/event-b/2', name: 'Event B' })
    }]`;

    const result = extractEvents(text);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Event A');
    expect(result[1].name).toBe('Event B');
  });

  it('should deduplicate events by pagePath', () => {
    const text = `[${eventJson()},${eventJson()}]`;

    const result = extractEvents(text);

    expect(result).toHaveLength(1);
  });

  it('should skip objects without required fields', () => {
    const text = `[{"id":1,"name":"Missing pagePath"}]`;

    const result = extractEvents(text);

    expect(result).toHaveLength(0);
  });

  it('should return empty array for text without events', () => {
    const result = extractEvents('no events here');

    expect(result).toHaveLength(0);
  });
});

describe('parseFindyConferenceHtml', () => {
  it('should parse events from full HTML with RSC streaming', () => {
    const html = rscPush(
      `["$","div",null,{"events":{"list":[${eventJson()}]}}]`,
    );

    const result = parseFindyConferenceHtml(html);

    expect(result).toHaveLength(1);
    expect(result[0].conferenceName).toBe('Test Conference 2026');
    expect(result[0].conferenceUrl).toBe(
      'https://conference.findy-code.io/events/test-conf-2026/1',
    );
    expect(result[0].cfpUrl).toBeNull();
    expect(result[0].conferenceDate).toEqual(
      new Date('2026-05-10T00:00:00+09:00'),
    );
    expect(result[0].location).toBeNull();
    expect(result[0].source).toBe('findy');
  });

  it('should set cfpUrl when CFP registration is open', () => {
    const html = rscPush(
      `[${eventJson({ cfpRegistrationStatus: 'started' })}]`,
    );

    const result = parseFindyConferenceHtml(html);

    expect(result).toHaveLength(1);
    expect(result[0].cfpUrl).toBe(
      'https://conference.findy-code.io/events/test-conf-2026/1',
    );
  });

  it('should handle events with Japanese names', () => {
    const html = rscPush(
      `[${eventJson({ name: 'クラウドネイティブ会議' })}]`,
    );

    const result = parseFindyConferenceHtml(html);

    expect(result).toHaveLength(1);
    expect(result[0].conferenceName).toBe('クラウドネイティブ会議');
  });

  it('should return empty array for HTML without events', () => {
    const html = '<html><body>No data</body></html>';

    const result = parseFindyConferenceHtml(html);

    expect(result).toHaveLength(0);
  });
});
