import {migrate} from '../backend/migrate.js';
import {pool} from '../backend/database/connection.js';
import {readFile} from 'node:fs/promises';
await migrate();
await pool.query(await readFile(new URL('../database/seed.sql',import.meta.url),'utf8'));
await pool.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mvr_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mvr_app; REVOKE UPDATE,DELETE ON audit_logs FROM mvr_app; REVOKE INSERT,UPDATE,DELETE ON schema_migrations,roles FROM mvr_app;');
await pool.end();console.log('Migrations, approved seed content and runtime-role grants applied.');
