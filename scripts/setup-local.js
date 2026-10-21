import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {writeFile,readFile} from 'node:fs/promises';
const admin=new pg.Client({connectionString:'postgresql://mvr_local@127.0.0.1:55432/postgres'});await admin.connect();
const password=randomBytes(24).toString('hex');
// Generated password contains hex only. ALTER ROLE cannot bind a password parameter.
await admin.query(`ALTER ROLE mvr_local PASSWORD '${password}'`);
for(const name of ['mvr_development','mvr_test']) if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount) await admin.query(`CREATE DATABASE ${name}`);
await admin.end();
await writeFile('.env',`DATABASE_URL=postgresql://mvr_local:${password}@127.0.0.1:55432/mvr_development\nTEST_DATABASE_URL=postgresql://mvr_local:${password}@127.0.0.1:55432/mvr_test\nAPP_ORIGIN=http://localhost:3000\nPORT=3000\nNODE_ENV=development\n`);
const hba=await readFile('.local/pgdata/pg_hba.conf','utf8');await writeFile('.local/pgdata/pg_hba.conf',hba.replace(/\btrust\b/g,'scram-sha-256'));
console.log('Isolated local development and test databases created. Credentials saved only in ignored .env. Reload PostgreSQL to enable password authentication.');
