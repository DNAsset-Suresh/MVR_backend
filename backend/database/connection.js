import pg from 'pg';
pg.types.setTypeParser(1082, value => value);
if(process.env.DATABASE_SCHEMA&&!/^mvr_test_[a-f0-9]+$/.test(process.env.DATABASE_SCHEMA)) throw new Error('Invalid isolated test schema.');
export const pool = new pg.Pool({connectionString: process.env.DATABASE_URL, max: 12, connectionTimeoutMillis: 5000,options:process.env.DATABASE_SCHEMA?`-c search_path=${process.env.DATABASE_SCHEMA}`:undefined});
export async function transaction(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
