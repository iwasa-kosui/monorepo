import { Result } from "@iwasa-kosui/result";
import type { StandardSchemaV1 } from '@standard-schema/spec'

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

type Parser<Output, Input> = Readonly<{
  parseOrThrow: (input: Input) => Output;
  parse: (input: Input) => Result<Output, ParseError>;
}>;

const fromStandardSchema = <Output, Input>(
  schema: StandardSchemaV1<Input, Output>
): Parser<Output, Input> => {
  const parse = (input: Input): Result<Output, ParseError> => {
    const result = schema["~standard"].validate(input);
    if (result instanceof Promise) {
      throw new TypeError('Schema validation must be synchronous');
    }
    if ('issues' in result && result.issues) {
      const messages = result.issues.map(issue => issue.message).join('; ');
      return Result.err(ParseError.create(messages));
    }
    return Result.ok(result.value);
  }

  const parseOrThrow = (input: Input): Output =>
    Result.flow(
      parse(input),
      Result.match<Output, ParseError, Output, never>({
        ok: (value) => value,
        err: (error) => {
          throw new Error(`ParseError: ${error.message}`);
        },
      })
    )

  return {
    parse,
    parseOrThrow,
  };
}

export const Parser = {
  fromStandardSchema,
} as const;
