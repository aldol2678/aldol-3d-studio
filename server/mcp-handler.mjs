import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {StudioService,toolSpecs} from './studio-service.mjs';
import {config,StudioError} from './config.mjs';
import {authenticate} from './auth.mjs';
import {body,json,originCheck,errorResponse,startLog} from './http.mjs';
export function createMcp(context){
 const server=new McpServer({name:'aldol-3d-studio',version:'0.6.0'}),service=new StudioService(context);
 for(const spec of toolSpecs.filter(s=>!s.write||context.canWrite)){
  const scopes=spec.write?['studio:read','studio:write']:['studio:read'];
  server.registerTool(spec.name,{description:spec.description,inputSchema:spec.schema,annotations:{readOnlyHint:!spec.write,destructiveHint:false,idempotentHint:true,openWorldHint:false},_meta:{securitySchemes:[{type:'oauth2',scopes}]}},async(args)=>{
   try{const result=await service.execute(spec.name,args);return {content:[{type:'text',text:JSON.stringify(result)}]};}
   catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({error:e instanceof StudioError?e.message:/^E_[A-Z_]+$/.test(e.message)?e.message:'E_TOOL_FAILED'})}]};}
  });
 }
 return server;
}
export function handler({getConfig=config,authenticateRequest=authenticate}={}){return async(req,res)=>{
 const c=getConfig();startLog(res);let server,transport;
 try{
  originCheck(req,c);
  // Always challenge unauthenticated callers, including while OAuth setup is blocked.
  if(!req.headers.authorization)throw new StudioError('E_AUTH_REQUIRED',401);
  if(!c.mcpEnabled)throw new StudioError('E_OAUTH_SETUP_REQUIRED',503);
  const context=await authenticateRequest(req,c,'mcp');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{error:'E_METHOD_NOT_ALLOWED'});}
  const request=await body(req);
  server=createMcp(context);transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.once('close',()=>{transport.close();server.close();});
  await server.connect(transport);await transport.handleRequest(req,res,request);
 }catch(e){if(!res.headersSent)errorResponse(res,e,c);}
};}
export default handler();
