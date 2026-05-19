export type SlackHttpError = Readonly<{
  kind: 'http';
  status: number;
  body: string;
}>;

export type SlackResponseError = Readonly<{
  kind: 'slack';
  error: string;
}>;

export type SlackParseError = Readonly<{
  kind: 'parse';
  message: string;
}>;

export type SlackNetworkError = Readonly<{
  kind: 'network';
  message: string;
}>;

import { assertNever } from '../util/assert-never.ts';

export type SlackApiError =
  | SlackHttpError
  | SlackResponseError
  | SlackParseError
  | SlackNetworkError;

export const SlackApiError = {
  format: (error: SlackApiError): string => {
    switch (error.kind) {
      case 'http':
        return `http ${error.status}: ${error.body}`;
      case 'slack':
        return `slack: ${error.error}`;
      case 'parse':
        return `parse: ${error.message}`;
      case 'network':
        return `network: ${error.message}`;
      default:
        return assertNever(error);
    }
  },
} as const;
