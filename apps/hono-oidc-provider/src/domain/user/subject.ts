import { z } from "zod/v4";
import { Parser } from "../../helper/parser.js";

const SubjectSymbol = Symbol('Subject');
const schema = z.string().min(1).brand(SubjectSymbol).describe('Subject');
export type Subject = z.output<typeof schema>;

const parser = Parser.fromStandardSchema<Subject, string>(schema);

/**
 * Subject はユーザーを一意に識別するための文字列であり、過去や将来にわたって変更されないことが求められます。
 * また、既に存在するユーザーと衝突しないように設計されなければなりません。
 */
export const Subject = {
  schema,
  ...parser,
} as const;
