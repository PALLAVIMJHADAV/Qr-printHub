import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config/index.js';
import * as schema from './schema.js';

// PostgreSQL connection query client
export const queryClient = postgres(config.DATABASE_URL, {
  max: config.DATABASE_POOL_MAX,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Drizzle instance with multi-tenant schema
export const db = drizzle(queryClient, { schema });

export * from './schema.js';
