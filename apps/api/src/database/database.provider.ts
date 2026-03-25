import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');
export const DB_POOL = Symbol('DB_POOL');

export const poolProvider = {
  provide: DB_POOL,
  useFactory: () => {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  },
};

export const databaseProvider = {
  provide: DRIZZLE,
  inject: [DB_POOL],
  useFactory: (pool: Pool) => {
    return drizzle(pool, { schema });
  },
};

export type Database = ReturnType<typeof drizzle<typeof schema>>;
