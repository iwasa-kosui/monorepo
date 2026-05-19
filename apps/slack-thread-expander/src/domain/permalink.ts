import { z } from 'zod';

import { SlackTs } from './slack-ts.ts';

export const PermalinkBrand = Symbol('Permalink');
const PermalinkSchema = z.string().min(1).brand<typeof PermalinkBrand>();
export type Permalink = z.infer<typeof PermalinkSchema>;

// search.messages のマッチオブジェクトはスレッド返信であっても thread_ts が欠落することがあるが、
// permalink には `?thread_ts=...&cid=...` の形でスレッド情報が含まれる。
const extractThreadTs = (permalink: Permalink): SlackTs | undefined => {
  const match = permalink.match(/[?&]thread_ts=([^&]+)/);
  const raw = match?.[1];
  if (raw == null) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const parsed = SlackTs.schema.safeParse(decoded);
  return parsed.success ? parsed.data : undefined;
};

export const Permalink = {
  schema: PermalinkSchema,
  parse: (raw: unknown) => PermalinkSchema.safeParse(raw),
  extractThreadTs,
} as const;
