import {config as getConfig,StudioError} from '../server/config.mjs';
import {authenticate} from '../server/auth.mjs';
import {body,json,originCheck,errorResponse,startLog} from '../server/http.mjs';
import {StudioService,digest,inspectBytes} from '../server/studio-service.mjs';
import {z} from 'zod';
const input=z.object({projectId:z.string().uuid(),sha256:z.string().regex(/^[a-f0-9]{64}$/),mime:z.enum(['image/png','model/gltf-binary']),base64:z.string().max(4194304)}).strict();
export const config={api:{bodyParser:false},maxDuration:30};
export default async function(req,res){const c=getConfig();startLog(res);try{
 originCheck(req,c);if(req.method!=='POST')throw new StudioError('E_METHOD_NOT_ALLOWED',405);
 const ctx=await authenticate(req,c,'pwa');let a;try{a=input.parse(await body(req,4300000));}catch(e){if(e.status)throw e;throw new StudioError('E_INPUT_SCHEMA');}
 await new StudioService(ctx).get(a.projectId);
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.base64))throw new StudioError('E_BASE64');
 const bytes=Buffer.from(a.base64,'base64');if(digest(bytes)!==a.sha256)throw new StudioError('E_ASSET_HASH');const structure=inspectBytes(bytes,a.mime);
 const {data:path,error}=await ctx.db.rpc('studio_reserve_asset',{p_project:a.projectId,p_sha:a.sha256,p_size:bytes.length,p_mime:a.mime});if(error)throw new StudioError(/E_[A-Z_]+/.exec(error.message)?.[0]||'E_ASSET_RESERVE');
 const bucket=ctx.db.storage.from('studio-assets');
 let {data:existing}=await bucket.download(path);
 if(!existing){const {error:e}=await bucket.upload(path,bytes,{contentType:a.mime,upsert:false});if(e)throw new StudioError('E_ASSET_UPLOAD');({data:existing}=await bucket.download(path));}
 if(!existing||digest(Buffer.from(await existing.arrayBuffer()))!==a.sha256)throw new StudioError('E_ASSET_READBACK',409);
 return json(res,200,{sha256:a.sha256,path,structure,verified:true});
}catch(e){errorResponse(res,e,c);}}
