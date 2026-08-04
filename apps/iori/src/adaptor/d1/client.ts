import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';

import { schema } from './schema.ts';

export type IoriD1Db = DrizzleD1Database<typeof schema>;

export const createD1Db = (d1: D1Database): IoriD1Db => drizzle(d1, { schema });
