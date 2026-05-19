import { assertNever } from '../util/assert-never.ts';

export type MissingProperty = Readonly<{
  kind: 'MissingProperty';
  key: string;
}>;

export type InvalidProperty = Readonly<{
  kind: 'InvalidProperty';
  key: string;
  reason: string;
}>;

export type ConfigError = MissingProperty | InvalidProperty;

export const ConfigError = {
  format: (error: ConfigError): string => {
    switch (error.kind) {
      case 'MissingProperty':
        return `missing Script Property: ${error.key}`;
      case 'InvalidProperty':
        return `invalid Script Property "${error.key}": ${error.reason}`;
      default:
        return assertNever(error);
    }
  },
} as const;
