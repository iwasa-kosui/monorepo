import type { LoggerPort } from '../../domain/logger-port.ts';

export const GasConsoleLogger = {
  create: (): LoggerPort => ({
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
    error: (m) => console.error(m),
  }),
} as const;
