import 'dotenv/config';
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { singleton } from '../../helper/singleton.ts';
import { PgConfig } from './pgConfig.ts';

const create = () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    ...PgConfig.getInstance(),
  });
  const db = drizzle({ client: pool });
  return db;
}

const getInstance = singleton(create);

export const DB = {
  getInstance,
} as const;
