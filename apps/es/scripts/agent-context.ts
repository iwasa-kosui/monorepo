import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { directoryOf } from '../src/playground/agent-task.ts';

export const agentContextFiles = ['db.ts', 'visits.test.ts', 'visits.ts'] as const;

export const agentContextPath = 'worker/agent/context.generated.ts';

export const renderAgentContext = (appDir: string): string => {
  const entries = ([1, 2] as const).map((step) => {
    const files = agentContextFiles.map((file) => {
      const source = readFileSync(join(appDir, 'exercises', directoryOf(step), file), 'utf8');
      return `    ${JSON.stringify(file)}: ${JSON.stringify(source)},`;
    });
    return `  ${step}: {\n${files.join('\n')}\n  },`;
  });
  return [
    'export const exerciseContext: Readonly<Record<1 | 2, Readonly<Record<string, string>>>> = {',
    ...entries,
    '};',
    '',
  ].join('\n');
};
