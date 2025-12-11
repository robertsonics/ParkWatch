import { neon } from '@neondatabase/serverless';

const connectionString = import.meta.env.VITE_NEON_DATABASE_URL;

if (!connectionString) {
  throw new Error("VITE_NEON_DATABASE_URL is not defined in your .env");
}

export const sql = neon(connectionString);
