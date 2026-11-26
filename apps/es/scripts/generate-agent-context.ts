import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { agentContextPath, renderAgentContext } from './agent-context.ts';

const appDir = join(import.meta.dirname, '..');
writeFileSync(join(appDir, agentContextPath), renderAgentContext(appDir));
console.log(`${agentContextPath} を作りました`);
