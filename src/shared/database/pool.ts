import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Ensure the environment variable is present
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is missing!');
}

const config: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  // Production-grade pooling configurations:
  max: 20,                  // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to sit idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait before timing out when connecting a new client
};

const pool = new Pool(config);

// Lifecycle logging for observability
pool.on('connect', () => {
  console.log('📡 New database client connected to the pool');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle database client', err);
  process.exit(-1); // Fail fast if the database connection encounters a critical error
});

export const db = {
  /**
   * Executes a safe, parameterized SQL query against the database pool.
   * @param text The SQL query string (e.g., 'SELECT * FROM users WHERE id = $1')
   * @param params The array of values to safely inject into the query placeholders
   */
  query: (text: string, params?: any[]) => {
    return pool.query(text, params);
  },
  
  // Expose the raw pool instance for advanced operations like transactions later
  pool
};