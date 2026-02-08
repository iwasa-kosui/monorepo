import { err, ok, Result } from '@iwasa-kosui/result';
import { z } from 'zod';

import { CfpEntry } from '../types.js';

const FINDY_CONFERENCE_URL = 'https://conference.findy-code.io/events';
const FETCH_TIMEOUT_MS = 10_000;

const FindyEventSchema = z.object({
  id: z.number(),
  pagePath: z.string().startsWith('/events/'),
  name: z.string(),
  startAt: z.string(),
  cfpRegistrationStatus: z.string().nullable(),
});

type FindyEvent = z.infer<typeof FindyEventSchema>;

export const fetchFindyConference = async (): Promise<Result<readonly CfpEntry[], Error>> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(FINDY_CONFERENCE_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'cfp-crawler/0.1.0',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return err(new Error(`HTTP ${response.status}: ${response.statusText}`));
    }

    const html = await response.text();
    const entries = parseFindyConferenceHtml(html);
    return ok(entries);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
};

export const parseFindyConferenceHtml = (html: string): readonly CfpEntry[] => {
  const rscText = extractRscText(html);
  const events = extractEvents(rscText);
  return events.map(toEntry);
};

/**
 * Extract and unescape all self.__next_f.push([1, "..."]) chunks from HTML.
 */
export const extractRscText = (html: string): string => {
  const chunks: string[] = [];
  const marker = 'self.__next_f.push([1,"';

  let searchFrom = 0;
  while (true) {
    const startIdx = html.indexOf(marker, searchFrom);
    if (startIdx === -1) break;

    const contentStart = startIdx + marker.length;

    // Walk forward to find the end of the string literal, handling escapes
    let pos = contentStart;
    while (pos < html.length) {
      if (html[pos] === '\\') {
        pos += 2; // Skip escape sequence
      } else if (html[pos] === '"') {
        break;
      } else {
        pos++;
      }
    }

    const raw = html.slice(contentStart, pos);
    try {
      const unescaped: string = JSON.parse(`"${raw}"`);
      chunks.push(unescaped);
    } catch {
      // Skip malformed chunks
    }

    searchFrom = pos + 1;
  }

  return chunks.join('');
};

/**
 * Extract event objects from unescaped RSC text by finding pagePath anchors
 * and extracting the enclosing JSON objects.
 */
export const extractEvents = (text: string): readonly FindyEvent[] => {
  const events: FindyEvent[] = [];
  const seen = new Set<string>();
  const anchor = '"pagePath":"/events/';

  let searchFrom = 0;
  while (true) {
    const anchorIdx = text.indexOf(anchor, searchFrom);
    if (anchorIdx === -1) break;

    searchFrom = anchorIdx + anchor.length;

    // Find the opening { of the enclosing object
    const objectStart = findObjectStart(text, anchorIdx);
    if (objectStart === -1) continue;

    // Find the matching }
    const objectEnd = findMatchingBrace(text, objectStart);
    if (objectEnd === -1) continue;

    const jsonStr = text.slice(objectStart, objectEnd + 1);

    try {
      const parsed: unknown = JSON.parse(jsonStr);
      const result = FindyEventSchema.safeParse(parsed);
      if (result.success && !seen.has(result.data.pagePath)) {
        seen.add(result.data.pagePath);
        events.push(result.data);
      }
    } catch {
      // Skip unparseable objects
    }
  }

  return events;
};

const findObjectStart = (text: string, fromPos: number): number => {
  let pos = fromPos - 1;
  let depth = 0;

  while (pos >= 0) {
    const char = text[pos];
    if (char === '"') {
      // Skip backward over string content
      pos--;
      while (pos >= 0) {
        if (text[pos] === '"' && (pos === 0 || text[pos - 1] !== '\\')) {
          break;
        }
        pos--;
      }
      pos--;
      continue;
    }
    if (char === '}') depth++;
    if (char === '{') {
      if (depth === 0) return pos;
      depth--;
    }
    pos--;
  }

  return -1;
};

const findMatchingBrace = (text: string, openPos: number): number => {
  let depth = 1;
  let pos = openPos + 1;

  while (pos < text.length && depth > 0) {
    const char = text[pos];
    if (char === '"') {
      // Skip over string content
      pos++;
      while (pos < text.length) {
        if (text[pos] === '\\') {
          pos += 2;
        } else if (text[pos] === '"') {
          pos++;
          break;
        } else {
          pos++;
        }
      }
      continue;
    }
    if (char === '{' || char === '[') depth++;
    if (char === '}' || char === ']') depth--;
    pos++;
  }

  return depth === 0 ? pos - 1 : -1;
};

const toEntry = (event: FindyEvent): CfpEntry => {
  const conferenceUrl = `https://conference.findy-code.io${event.pagePath}`;

  return {
    conferenceName: event.name,
    cfpUrl: event.cfpRegistrationStatus ? conferenceUrl : null,
    conferenceUrl,
    cfpDeadline: null,
    conferenceDate: new Date(event.startAt),
    location: null,
    source: 'findy',
  };
};
