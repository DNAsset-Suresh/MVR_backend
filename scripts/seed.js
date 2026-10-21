import {readFile} from 'node:fs/promises';
import {pool} from '../backend/database/connection.js';
await pool.query(await readFile(new URL('../database/seed.sql',import.meta.url),'utf8'));
await pool.end(); console.log('Approved initial content saved. Availability remains empty until published by an admin.');
