import { Result } from '@iwasa-kosui/result';
import type { $ZodType } from 'zod/v4/core';

type ParseError = Readonly<{
  kind: 'ParseError';
  message: string;
}>;

const ParseError = {
  create: (message: string): ParseError => ({
    kind: 'ParseError',
    message,
  }),
} as const;

export type Schema<Output, Input> = Readonly<{
  of: (input: Input) => Result<Output, ParseError>;
  orThrow: (input: Input) => Output;
  parseOrThrow: (input: unknown) => Output;
  parse: (input: unknown) => Result<Output, ParseError>;
  zodType: $ZodType<Output, Input>;
}>;

export type InferSchema<SC> = SC extends Schema<infer Output, infer _Input> ? Output : never;

const create = <Output, Input>(
  zodType: $ZodType<Output, Input>,
): Schema<Output, Input> => {
  const parse = (input: unknown): Result<Output, ParseError> => {
    const result = zodType['~standard'].validate(input);
    if (result instanceof Promise) {
      throw new TypeError('Schema validation must be synchronous');
    }
    if ('issues' in result && result.issues) {
      const messages = result.issues.map(issue => issue.message).join('; ');
      return Result.err(ParseError.create(messages));
    }
    return Result.ok(result.value);
  };

  const parseOrThrow = (input: unknown): Output =>
    Result.flow(
      parse(input),
      Result.match({
        ok: (value: Output) => value,
        err: (error: ParseError) => {
          throw new Error(`ParseError: ${error.message}`);
        },
      }),
    );

  const of = (input: Input): Result<Output, ParseError> => parse(input);

  const orThrow = (input: Input): Output => parseOrThrow(input);

  return {
    of,
    orThrow,
    parseOrThrow,
    parse,
    zodType,
  };
};

export const Schema = {
  create,
} as const;
