// Local preview only: no migrations, seeding or outbound notification worker.
import {createApp} from '../backend/app.js';
import {pool} from '../backend/database/connection.js';
if(!process.env.DATABASE_URL||!process.env.APP_ORIGIN)throw new Error('Configure DATABASE_URL and APP_ORIGIN in .env.');
await pool.query('SELECT 1 FROM schema_migrations');
const server=createApp().listen(Number(process.env.PORT||3000),'127.0.0.1');
server.on('listening',()=>console.log(`MVR local preview: ${process.env.APP_ORIGIN} (notification worker disabled)`));
server.on('error',error=>{console.error('Preview could not start:',error.code);pool.end();process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await pool.end();process.exit(0);}));
