import z from "zod/v4";
import { Parser } from "../helper/parser.js";

const InstantSymbol = Symbol('Instant');
const schema = z.number().int().min(0).brand(InstantSymbol).describe('Instant');
export type Instant = z.output<typeof schema>;

const parser = Parser.fromStandardSchema<Instant, number>(schema);

/**
 * Instant は1970年1月1日00:00:00 UTCから経過したミリ秒数を表す整数です。
 * Unix時間とは異なり、秒単位ではなくミリ秒単位で表現されます。
 */
export const Instant = {
  schema,
  ...parser,
} as const;
