import { readFileSync } from 'fs';

import { Env } from '../../env.ts';
import { singleton } from '../../helper/singleton.ts';

export const PgConfig = {
  getInstance: singleton(() => {
    const env = Env.getInstance();
    if (env.APP_ENV === 'production') {
      return {
        ssl: { ca: readFileSync(env.DATABASE_CERT).toString() },
      };
    }
    return {};
  }),
} as const;
