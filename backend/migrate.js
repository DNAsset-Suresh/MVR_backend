import {readFile} from 'node:fs/promises';
import {pool, transaction} from './database/connection.js';
export async function migrate() {
 await transaction(async db => {
  await db.query('SELECT pg_advisory_xact_lock(781226)');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='001'")).rowCount) {
   await db.query(await readFile(new URL('../database/schema.sql',import.meta.url),'utf8'));
   await db.query("INSERT INTO schema_migrations(version) VALUES('001')");
  }
  if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='002'")).rowCount) {
   await db.query(await readFile(new URL('../database/migrations/002-reference.sql',import.meta.url),'utf8'));
   await db.query("INSERT INTO schema_migrations(version) VALUES('002')");
  }
  if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='003'")).rowCount) {
   await db.query(await readFile(new URL('../database/migrations/003-optional-description.sql',import.meta.url),'utf8'));
   await db.query("INSERT INTO schema_migrations(version) VALUES('003')");
  }
  if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='004'")).rowCount) {
   await db.query(await readFile(new URL('../database/migrations/004-event-details.sql',import.meta.url),'utf8'));
   await db.query("INSERT INTO schema_migrations(version) VALUES('004')");
  }
  if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='005'")).rowCount) {
   await db.query(await readFile(new URL('../database/migrations/005-accounts-and-halves.sql',import.meta.url),'utf8'));
   await db.query("INSERT INTO schema_migrations(version) VALUES('005')");
  }
 });
}
if (process.argv[1]?.endsWith('migrate.js')) { await migrate(); console.log('Database migrations applied.'); await pool.end(); }
