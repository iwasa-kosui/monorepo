import z from "zod/v4";

import { Schema } from "../../helper/schema.ts";

export const InstantSym = Symbol('Instant');
const zodType = z.number().int().nonnegative().brand(InstantSym).describe('Instant');
const schema = Schema.create<z.output<typeof zodType>, number>(zodType);

/**
 * Instant は、1970年1月1日00:00:00 UTC からの経過ミリ秒数を表す整数です。
 */
export type Instant = z.output<typeof zodType>;

const now = (): Instant => Date.now() as Instant;
const addDuration = (instant: Instant, durationMs: number): Instant =>
  (instant + durationMs) as Instant;

export const Instant = {
  ...schema,
  now,
  addDuration,
  toDate: (instant: Instant): Date => new Date(instant),
} as const;
