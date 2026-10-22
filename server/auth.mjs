import {createRemoteJWKSet,jwtVerify} from 'jose';
import {createClient} from '@supabase/supabase-js';
import {StudioError} from './config.mjs';
const sets=new Map();
export function checkClaims(p,c,kind){
 if(typeof p.sub!=='string'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(p.sub)||typeof p.session_id!=='string'||p.role!=='authenticated'||p.is_anonymous===true)throw new StudioError('E_IDENTITY',401);
 const scopes=typeof p.scope==='string'?p.scope.split(' '):[];
 if(kind==='mcp'&&(!p.client_id||!scopes.includes('studio:read')))throw new StudioError('E_SCOPE',403);
 if(kind==='pwa'&&p.client_id)throw new StudioError('E_PWA_TOKEN_REQUIRED',403);
 return {userId:p.sub,canWrite:kind==='pwa'||(c.writesEnabled&&scopes.includes('studio:write')),scopes};
}
export async function verifyAccessToken(token,key,c,kind){
 const {payload}=await jwtVerify(token,key,{issuer:c.issuer,audience:kind==='mcp'?c.resource:'authenticated',algorithms:['ES256','RS256'],requiredClaims:['sub','exp','iat','session_id']});
 checkClaims(payload,c,kind);return payload;
}
export async function authenticate(req,c,kind='mcp'){
 if(!c.supabaseUrl||!c.publishableKey)throw new StudioError('E_CLOUD_NOT_CONFIGURED',503);
 const match=/^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.authorization||'');
 if(!match)throw new StudioError('E_AUTH_REQUIRED',401);
 const token=match[1];
 if(!sets.has(c.issuer))sets.set(c.issuer,createRemoteJWKSet(new URL(c.issuer+'/.well-known/jwks.json'),{timeoutDuration:5000}));
 let payload;try{payload=await verifyAccessToken(token,sets.get(c.issuer),c,kind);}catch{throw new StudioError('E_TOKEN_INVALID',401);}
 const identity=checkClaims(payload,c,kind);
 const db=createClient(c.supabaseUrl,c.publishableKey,{global:{headers:{Authorization:'Bearer '+token},fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(8000)})},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 // Server verifies identity; RLS additionally checks that auth.sessions still exists.
 const {data,error}=await db.auth.getUser(token);
 if(error||data.user?.id!==identity.userId)throw new StudioError('E_TOKEN_REVOKED',401);
 return {...identity,db};
}
