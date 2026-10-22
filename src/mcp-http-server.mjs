import {createServer} from 'node:http';
import {createStudioMcpRuntime} from './mcp-runtime.mjs';

// Preparation transport only. A remote public binding must introduce validated
// OAuth 2.1 and per-user authorization BEFORE enabling access. This module
// deliberately cannot bind to a non-loopback host or expose write tools.
const MAX_REQUEST_BYTES=2*1024*1024;
const headers={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'content-security-policy':"default-src 'none'",
};
const respond=(res,code,data)=>{
  res.writeHead(code,headers);
  res.end(JSON.stringify(data));
};
const protocolError=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
const hostOK=host=>typeof host==='string'&&/^(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/.test(host);

async function readJson(req){
  let size=0;const chunks=[];
  for await(const part of req){
    size+=part.length;
    if(size>MAX_REQUEST_BYTES)throw Error('E_BODY_TOO_LARGE');
    chunks.push(part);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw Error('E_JSON_INVALID');}
}

export async function createLoopbackMcpServer({editorDir,worldFile=null}={}){
  const runtime=await createStudioMcpRuntime({editorDir,worldFile,allowWrite:false});
  const server=createServer(async(req,res)=>{
    // A hostile web page or DNS-rebinding host must not access even loopback.
    if(!hostOK(req.headers.host)||req.headers.origin||req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='none'){
      return respond(res,403,{error:'E_LOOPBACK_ONLY'});
    }
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/health'&&req.method==='GET'){
      return respond(res,200,{status:'ok',transport:'mcp-streamable-http-json',scope:'loopback-only',readOnly:true,auth:'not-configured',remoteReady:false});
    }
    if(pathname!=='/mcp')return respond(res,404,{error:'E_NOT_FOUND'});
    if(req.method!=='POST'){
      res.setHeader('allow','POST');
      return respond(res,405,{error:'E_METHOD_NOT_ALLOWED'});
    }
    if(!/^application\/json(?:\s*;|\s*$)/i.test(req.headers['content-type']||'')){
      return respond(res,415,{error:'E_JSON_REQUIRED'});
    }
    // Strict protocol version handling; never accept versions silently.
    const requestedVersion=req.headers['mcp-protocol-version'];
    if(requestedVersion && requestedVersion!=='2025-06-18'){
      return respond(res,400,{error:'E_MCP_PROTOCOL_VERSION_UNSUPPORTED'});
    }
    let request;
    try{request=await readJson(req);}
    catch(e){return respond(res,e.message==='E_BODY_TOO_LARGE'?413:400,protocolError(null,-32700,e.message));}
    if(!request||Array.isArray(request)||typeof request!=='object'||request.jsonrpc!=='2.0'||typeof request.method!=='string'){
      return respond(res,400,protocolError(request&&typeof request.id!=='object'?request.id??null:null,-32600,'Invalid Request'));
    }
    if(request.id===undefined){
      // MCP notifications have no JSON-RPC response.
      res.writeHead(202,{'cache-control':'no-store','x-content-type-options':'nosniff'});
      res.end();
      return;
    }
    try{
      const result=await runtime.handle(request);
      respond(res,200,{jsonrpc:'2.0',id:request.id,result});
    }catch(e){
      respond(res,200,protocolError(request.id,Number.isInteger(e.code)?e.code:-32603,e.message||'Internal error'));
    }
  });
  return server;
}
