import {config as getConfig,StudioError} from '../server/config.mjs';
import {authenticate} from '../server/auth.mjs';
import {body,json,originCheck,errorResponse,startLog} from '../server/http.mjs';
import {StudioService} from '../server/studio-service.mjs';
export const config={api:{bodyParser:false},maxDuration:30};
export default async function(req,res){const c=getConfig();startLog(res);try{
 originCheck(req,c);
 if(req.method==='GET')return json(res,200,{buildSha:process.env.VERCEL_GIT_COMMIT_SHA||null,configured:Boolean(c.supabaseUrl&&c.publishableKey),supabaseUrl:c.supabaseUrl,publishableKey:c.publishableKey,mcpEnabled:c.mcpEnabled,mcpWrites:c.writesEnabled});
 if(req.method!=='POST')return json(res,405,{error:'E_METHOD_NOT_ALLOWED'});
 const context=await authenticate(req,c,'pwa'),request=await body(req);
 return json(res,200,await new StudioService(context).execute(request.tool,request.arguments));
}catch(e){errorResponse(res,e,c);}}
