import {randomUUID} from 'node:crypto';
import {StudioError} from './config.mjs';
export function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));}
export async function body(req,limit=3*1024*1024+65536){
 if(Number(req.headers['content-length'])>limit)throw new StudioError('E_REQUEST_TOO_LARGE',413);
 if(req.body!==undefined){const s=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(s)>limit)throw new StudioError('E_REQUEST_TOO_LARGE',413);try{return JSON.parse(s);}catch{throw new StudioError('E_JSON_INVALID');}}
 let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw new StudioError('E_REQUEST_TOO_LARGE',413);chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new StudioError('E_JSON_INVALID');}
}
export function originCheck(req,c){if(req.headers.origin&&req.headers.origin!==c.origin&&req.headers.origin!==`https://${process.env.VERCEL_URL}`)throw new StudioError('E_ORIGIN',403);}
export function errorResponse(res,e,c){const status=e.status||500;if(status===401)res.setHeader('WWW-Authenticate',`Bearer resource_metadata="${c.origin}/.well-known/oauth-protected-resource", error="invalid_token"`);json(res,status,{error:status===500?'E_INTERNAL':e.message});}
export function startLog(res){const id=randomUUID(),start=Date.now();res.setHeader('X-Request-ID',id);res.once('finish',()=>console.info(JSON.stringify({event:'studio_request',requestId:id,status:res.statusCode,durationMs:Date.now()-start})));}
