import { err, ok, Result } from '@iwasa-kosui/result';
import { z } from 'zod';

export const ConfigSchema = z.object({
  file: z.string().min(1, 'File path is required'),
  port: z.number().int().min(1).max(65535).default(3000),
  open: z.boolean().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;

export type ConfigError = Readonly<{
  type: 'ConfigError';
  message: string;
  issues: z.ZodIssue[];
}>;

export const ConfigError = {
  new: (error: z.ZodError): ConfigError => ({
    type: 'ConfigError',
    message: error.message,
    issues: error.issues,
  }),
} as const;

export const parseArgs = (args: readonly string[]): Result<Config, ConfigError> => {
  const file = args.find((arg) => !arg.startsWith('-'));
  const portArg = args.find((arg) => arg.startsWith('--port=') || arg.startsWith('-p='));
  const hasOpen = args.includes('--open') || args.includes('-o');

  const portIndex = args.findIndex((arg) => arg === '--port' || arg === '-p');
  const portValue = portArg
    ? portArg.split('=')[1]
    : portIndex !== -1
    ? args[portIndex + 1]
    : undefined;

  const raw = {
    file,
    port: portValue ? parseInt(portValue, 10) : undefined,
    open: hasOpen,
  };

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    return err(ConfigError.new(result.error));
  }
  return ok(result.data);
};

export const showUsage = (): string =>
  `
mdlive v0.1.0 - Markdown Live Preview

Usage:
  mdlive <file> [options]

Options:
  --port, -p <port>  Port number (default: 3000)
  --open, -o         Open browser automatically

Examples:
  mdlive README.md
  mdlive README.md --open
  mdlive README.md --port 8080 --open
`.trim();
