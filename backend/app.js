import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import {rateLimit} from 'express-rate-limit';
import {ZodError} from 'zod';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {pool} from './database/connection.js';
import {authRoutes} from './routes/auth.js';
import {requireAuth,session} from './middleware/auth.js';
import {publicAvailability,adminAvailability} from './routes/availability.js';
import {userRoutes} from './routes/user.js';
import {adminRoutes} from './routes/admin.js';
import {contentRoutes,uploadDirectory} from './routes/content.js';
import {publicRoutes} from './routes/public.js';
import {createAssistantRouter} from './routes/assistant.js';
import {assistantAdmin} from './routes/assistant-admin.js';
import {fail} from './utils/security.js';
const root=fileURLToPath(new URL('../frontend/',import.meta.url));
export const publicPages=['index','about','journey','speaking','programmes','trust','media','availability','contact','privacy','terms'];
const userPages=['dashboard','bookings','booking-details','profile'];
const adminPages=['dashboard','bookings','booking-details','availability','calendar','users','programmes','content','media','testimonials','trust','notifications','settings','audit-logs'];
export function createApp({assistantOptions}={}) {
 const app=express();
 app.disable('x-powered-by');
 if(process.env.TRUST_PROXY==='1') app.set('trust proxy',1);
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'",'https:','data:'],mediaSrc:["'self'",'https:','blob:'],connectSrc:["'self'"],formAction:["'self'"],frameAncestors:["'none'"],upgradeInsecureRequests:process.env.NODE_ENV==='production'?[]:null}},strictTransportSecurity:process.env.NODE_ENV==='production'?undefined:false}));
 app.use(cookieParser());
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.use('/api',rateLimit({windowMs:60000,limit:300,standardHeaders:'draft-8',legacyHeaders:false,message:{success:false,message:'Too many requests. Please try again shortly.'}}));
 // Same-origin only: custom header + Origin checks prevent cross-site writes,
 // including unauthenticated login/register CSRF. Authenticated writes also require session CSRF tokens.
 app.use('/api',(req,res,next)=>{
  const origin=req.get('Origin');
  if(origin&&origin!==process.env.APP_ORIGIN) fail(403,'Cross-origin requests are not permitted.');
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('X-MVR-Request')!=='1') fail(403,'Missing request verification header.');
  next();
 });
 app.use(express.json({limit:'64kb'}));
 app.get('/api/health',async(req,res)=>{await pool.query('SELECT 1');res.json({success:true,data:{status:'ok'}});});
 app.use('/api/auth',authRoutes('user'));
 app.use('/api/admin/auth',authRoutes('admin'));
 app.use('/api/availability',publicAvailability);
 app.use('/api/assistant',createAssistantRouter(assistantOptions));
 app.use('/api/user',requireAuth('user'),userRoutes);
 app.use('/api/admin/availability',requireAuth('admin'),adminAvailability);
 app.use('/api/admin/assistant',requireAuth('admin'),assistantAdmin);
 app.use('/api/admin',requireAuth('admin'),adminRoutes,contentRoutes);
 app.use('/api',publicRoutes);
 app.all('/api/bookings{/:reference}',requireAuth('user'),(req,res)=>res.redirect(307,req.originalUrl.replace('/api/bookings','/api/user/bookings')));
 app.get('/api/notifications',requireAuth('user'),async(req,res)=>{const {rows}=await pool.query('SELECT id,title,body,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.auth.id]);res.json({success:true,data:rows});});
 app.patch('/api/notifications/:id/read',requireAuth('user'),async(req,res)=>{await pool.query('UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2',[req.params.id,req.auth.id]);res.json({success:true,data:{}});});
 app.use('/api',(req,res)=>res.status(404).json({success:false,message:'API endpoint not found.'}));
 app.use('/css',express.static(path.join(root,'css'),{maxAge:process.env.NODE_ENV==='production'?'1h':0,dotfiles:'deny'}));
 app.use('/js',express.static(path.join(root,'js'),{maxAge:0,dotfiles:'deny'}));
 app.use('/assets',express.static(path.join(root,'assets'),{maxAge:'1d',dotfiles:'deny'}));
 app.get('/uploads/:filename',async(req,res)=>{
  const name=req.params.filename;
  if(!/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|pdf|mp4)$/.test(name)) fail(404,'File not found.');
  const record=(await pool.query('SELECT mime FROM uploads WHERE filename=$1',[name])).rows[0];if(!record) fail(404,'File not found.');
  res.set('Content-Type',record.mime);if(record.mime==='application/pdf') res.set('Content-Disposition',`attachment; filename="${name}"`);
  res.sendFile(path.join(uploadDirectory,name),{dotfiles:'allow'});
 });
 app.get('/robots.txt',(req,res)=>res.type('text').send(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /user/\nDisallow: /api/\nDisallow: /booking.html\nSitemap: ${process.env.APP_ORIGIN}/sitemap.xml\n`));
 app.get('/sitemap.xml',(req,res)=>res.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${publicPages.map(p=>`<url><loc>${process.env.APP_ORIGIN}/${p==='index'?'':p+'.html'}</loc></url>`).join('')}</urlset>`));
 app.get('/{*page}',async(req,res)=>{
  let pathname=path.posix.normalize('/'+decodeURIComponent(req.path).replace(/^\/+/,''));if(pathname==='/') pathname='/index.html';
  const parts=pathname.slice(1).split('/');
  const name=parts.at(-1).replace(/\.html$/,'');
  if(!pathname.endsWith('.html')) return res.status(404).send('Page not found.');
  let allowed=false;
  if(parts.length===1) allowed=[...publicPages,'login','register','forgot-password','reset-password','booking','track-enquiry'].includes(name);
  if(parts[0]==='admin'&&parts.length===2){allowed=['login',...adminPages].includes(name);if(allowed&&name!=='login'&&!await session(req,'admin')) return res.status(403).set('Refresh','0; url=/admin/login.html').send('<!doctype html><html lang="en"><title>Access required</title><h1>403 Forbidden</h1><p>Administrator access is required.</p><a href="/admin/login.html">Admin login</a></html>');}
  if(parts[0]==='user'&&parts.length===2) allowed=userPages.includes(name);
  if(!allowed) return res.status(404).send('Page not found.');
  if((parts[0]==='user'||['booking','track-enquiry'].includes(name))&&!await session(req,'user')) return res.redirect('/login.html');
  res.set('Cache-Control','no-store');
  if(!publicPages.includes(name)||parts.length!==1) res.set('X-Robots-Tag','noindex, nofollow');
  const html=await readFile(path.join(root,...parts),'utf8');res.type('html').send(html.replaceAll('{{ORIGIN}}',process.env.APP_ORIGIN));
 });
 app.use((error,req,res,next)=>{
  if(res.headersSent) return next(error);
  let status=error.status||500,message=error.message;
  if(error instanceof ZodError){status=400;message=error.issues.map(e=>`${e.path.join('.')||'Input'}: ${e.message}`).join(' ');}
  if(['23505','23P01'].includes(error.code)){status=409;message=error.code==='23P01'?'This time overlaps another published slot.':'This account or booking already exists, or the slot is reserved.';}
  if(['23503','23514','22P02'].includes(error.code)){status=400;message='The request conflicts with the current record. Please check your input.';}
  if(status>=500){console.error(JSON.stringify({level:'error',method:req.method,path:req.path,code:error.code||'SERVER_ERROR',message:error.message}));message='Something went wrong. Please try again.';}
  res.status(status).json({success:false,message});
 });return app;
}
