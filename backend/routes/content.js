import {Router,raw} from 'express';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {pool,transaction} from '../database/connection.js';
import {permit} from '../middleware/auth.js';
import {audit,fail} from '../utils/security.js';
import * as v from '../validators/index.js';
export const uploadDirectory=path.resolve(process.env.UPLOAD_DIR||'.local/uploads');
export const contentRoutes=Router();
function contentPermission(req,res,next) {
 const kind=req.body.kind??req.query.kind;
 if(kind==='trust'||kind==='future-vision') return permit('trust')(req,res,next);
 return permit('content')(req,res,next);
}
contentRoutes.get('/content',async(req,res)=>{
 const kind=req.query.kind?z.enum(v.kinds).parse(req.query.kind):null;
 if(!req.auth.roles.some(r=>['SUPER_ADMIN','CONTENT_MANAGER','TRUST_MANAGER','VIEWER'].includes(r))) fail(403,'Content access required.');
 if(req.auth.roles.includes('TRUST_MANAGER')&&!req.auth.roles.some(r=>['SUPER_ADMIN','CONTENT_MANAGER','VIEWER'].includes(r))&&(!kind||!['trust','future-vision'].includes(kind))) fail(403,'Select a trust content section.');
 res.json({success:true,data:(await pool.query('SELECT * FROM content_items WHERE ($1::text IS NULL OR kind=$1) ORDER BY sort_order,created_at',[kind])).rows});
});
contentRoutes.post('/content',contentPermission,async(req,res)=>{
 const data=v.content.parse(req.body);
 const row=await transaction(async db=>{
  const row=(await db.query('INSERT INTO content_items(kind,title,body,url,image_url,published,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',Object.values(data))).rows[0];
  await audit(db,req,'CREATE','content',row.id,null,{kind:row.kind,published:row.published});return row;
 });res.status(201).json({success:true,data:row});
});
contentRoutes.put('/content/:id',contentPermission,async(req,res)=>{
 const id=v.uuid.parse(req.params.id),data=v.content.parse(req.body);
 const row=await transaction(async db=>{
  const old=(await db.query('SELECT * FROM content_items WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old) fail(404,'Content not found.');
  if(old.kind!==data.kind) fail(400,'A content item cannot change sections.');
  const row=(await db.query('UPDATE content_items SET title=$1,body=$2,url=$3,image_url=$4,published=$5,sort_order=$6,updated_at=now() WHERE id=$7 RETURNING *',[data.title,data.body,data.url,data.image_url,data.published,data.sort_order,id])).rows[0];
  await audit(db,req,'UPDATE','content',id,{published:old.published},{published:row.published});return row;
 });res.json({success:true,data:row});
});
contentRoutes.delete('/content/:id',async(req,res)=>{
 const id=v.uuid.parse(req.params.id);
 await transaction(async db=>{
  const row=(await db.query('SELECT * FROM content_items WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row) fail(404,'Content not found.');
  const permitted=['trust','future-vision'].includes(row.kind)?['SUPER_ADMIN','TRUST_MANAGER']:['SUPER_ADMIN','CONTENT_MANAGER'];
  if(!req.auth.roles.some(r=>permitted.includes(r))) fail(403,'Your role does not permit this action.');
  await db.query('DELETE FROM content_items WHERE id=$1',[id]);await audit(db,req,'DELETE','content',id,{kind:row.kind});
 });res.json({success:true,data:{}});
});
const settingsSchema=z.object({contact_email:z.union([v.email,z.literal('')]),contact_phone:z.union([v.phone,z.literal('')]),whatsapp_number:z.string().regex(/^\d{7,15}$|^$/),address:z.string().trim().max(1000),tagline:z.string().trim().min(1).max(300)}).strict();
contentRoutes.get('/settings',permit('settings'),async(req,res)=>res.json({success:true,data:Object.fromEntries((await pool.query('SELECT key,value FROM site_settings')).rows.map(r=>[r.key,r.value]))}));
contentRoutes.put('/settings',permit('settings'),async(req,res)=>{
 const data=settingsSchema.parse(req.body);
 await transaction(async db=>{for(const [key,value] of Object.entries(data)) await db.query('INSERT INTO site_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()',[key,JSON.stringify(value)]);await audit(db,req,'UPDATE','settings','public-contact');});
 res.json({success:true,data});
});
contentRoutes.post('/uploads',permit('content'),raw({type:()=>true,limit:'20mb'}),async(req,res)=>{
 const filename=req.get('X-Filename')||'',mime=req.get('Content-Type')?.split(';')[0],bytes=req.body;
 const allowed={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.pdf':'application/pdf','.mp4':'video/mp4'};
 const ext=path.extname(filename).toLowerCase();
 if(!Buffer.isBuffer(bytes)||!bytes.length||allowed[ext]!==mime) fail(400,'Upload a JPEG, PNG, WebP, PDF or MP4 file up to 20 MB.');
 const signatures={'image/jpeg':()=>bytes.subarray(0,3).equals(Buffer.from([255,216,255])),'image/png':()=>bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'image/webp':()=>bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP','application/pdf':()=>bytes.toString('ascii',0,5)==='%PDF-','video/mp4':()=>bytes.toString('ascii',4,8)==='ftyp'};
 if(!signatures[mime]()) fail(400,'The file contents do not match its type.');
 const id=randomUUID(),name=id+ext;
 await mkdir(uploadDirectory,{recursive:true});await writeFile(path.join(uploadDirectory,name),bytes,{flag:'wx'});
 try {await transaction(async db=>{await db.query('INSERT INTO uploads(id,filename,mime,bytes,created_by) VALUES($1,$2,$3,$4,$5)',[id,name,mime,bytes.length,req.auth.id]);await audit(db,req,'UPLOAD','media',id,null,{mime,bytes:bytes.length});});}
 catch(error){await unlink(path.join(uploadDirectory,name));throw error;}
 res.status(201).json({success:true,data:{url:'/uploads/'+name,mime}});
});
