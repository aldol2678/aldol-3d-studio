import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {handler,createMcp} from '../server/mcp-handler.mjs';
import {checkClaims,verifyAccessToken} from '../server/auth.mjs';
import {inspectBytes,digest,toolSpecs} from '../server/studio-service.mjs';
import {body} from '../server/http.mjs';
import {Readable} from 'node:stream';
const c={origin:'https://studio.example',resource:'https://studio.example/mcp',supabaseUrl:'https://db.example',publishableKey:'public',mcpEnabled:true,writesEnabled:false};
const userId='11111111-1111-4111-8111-111111111111';
const db={from(table){return {select(){return this},order(){return this},limit(){return Promise.resolve({data:[],error:null})}}}};
test('claim isolation, OAuth client and write scope gates',()=>{
 const p={sub:userId,session_id:userId,role:'authenticated',client_id:'client',scope:'studio:read studio:write'};
 assert.equal(checkClaims(p,c,'mcp').canWrite,false);
 assert.equal(checkClaims(p,{...c,writesEnabled:true},'mcp').canWrite,true);
 for(const patch of [{role:'anon'},{is_anonymous:true},{sub:'../escape'},{session_id:null},{scope:'profile'},{client_id:null}])assert.throws(()=>checkClaims({...p,...patch},c,'mcp'));
 assert.throws(()=>checkClaims(p,c,'pwa'));
});
test('every tool has strict input schema, UUID project boundary and classified write permissions',()=>{
 assert.equal(toolSpecs.length,21);for(const t of toolSpecs)assert.equal(t.schema.safeParse({unexpected:1}).success,false);
 assert.equal(toolSpecs.find(t=>t.name==='scene_dispatch').schema.safeParse({projectId:'../../other',command:{}}).success,false);
});
test('request limits reject both parsed and streamed oversized JSON',async()=>{
 await assert.rejects(body({headers:{'content-length':'1000'}},100),/E_REQUEST_TOO_LARGE/);
 await assert.rejects(body({headers:{},body:{x:'a'.repeat(200)}},100),/E_REQUEST_TOO_LARGE/);
 const req=Readable.from([Buffer.alloc(201)]);req.headers={};await assert.rejects(body(req,100),/E_REQUEST_TOO_LARGE/);
});
test('malformed GLB, invalid PNG, oversized asset rejected; SHA256 is byte exact',()=>{
 assert.throws(()=>inspectBytes(new Uint8Array([1,2,3]),'model/gltf-binary'));
 assert.throws(()=>inspectBytes(new Uint8Array(60),'image/png'));
 assert.throws(()=>inspectBytes(new Uint8Array(3145729),'image/png'),/3MB/);
 assert.equal(digest(Buffer.from('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('real SDK Streamable HTTP initialization, discovery, call, schema rejection and public guard',async()=>{
 const h=handler({getConfig:()=>c,authenticateRequest:async()=>({userId,canWrite:false,db})});
 const server=createServer(h);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=new URL('http://127.0.0.1:'+server.address().port+'/mcp');
 const client=new Client({name:'studio-integration-test',version:'1'});
 try{
  const unauth=await fetch(url);assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate'),/oauth-protected-resource/);
  const origin=await fetch(url,{headers:{origin:'https://evil.example'}});assert.equal(origin.status,403);
  await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:'Bearer test'}}}));
  const {tools}=await client.listTools();assert.ok(tools.find(t=>t.name==='project_list'));assert.ok(!tools.find(t=>t.name==='scene_dispatch'));
  const result=await client.callTool({name:'project_list',arguments:{}});assert.deepEqual(JSON.parse(result.content[0].text),{projects:[]});
  const invalid=await client.callTool({name:'project_get',arguments:{projectId:'../other'}});assert.equal(invalid.isError,true);
 }finally{await client.close();await new Promise(r=>server.close(r));}
});
test('configured OAuth gate fails closed even for a bearer token',async()=>{
 const server=createServer(handler({getConfig:()=>({...c,mcpEnabled:false})}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const r=await fetch('http://127.0.0.1:'+server.address().port,{headers:{Authorization:'Bearer invalid'}});assert.equal(r.status,503);assert.equal((await r.json()).error,'E_OAUTH_SETUP_REQUIRED');}finally{await new Promise(r=>server.close(r));}
});

import {generateKeyPair,SignJWT} from 'jose';
test('signed JWT validation rejects expiry, wrong resource, issuer and signature',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('ES256'),other=await generateKeyPair('ES256');
 const cfg={...c,issuer:'https://issuer.example'};
 const mint=(aud=cfg.resource,iss=cfg.issuer,exp='5m')=>new SignJWT({session_id:userId,role:'authenticated',client_id:'test',scope:'studio:read'}).setProtectedHeader({alg:'ES256'}).setSubject(userId).setIssuedAt().setExpirationTime(exp).setIssuer(iss).setAudience(aud).sign(privateKey);
 await verifyAccessToken(await mint(),publicKey,cfg,'mcp');
 await assert.rejects(verifyAccessToken(await mint('wrong'),publicKey,cfg,'mcp'));
 await assert.rejects(verifyAccessToken(await mint(cfg.resource,'wrong'),publicKey,cfg,'mcp'));
 await assert.rejects(verifyAccessToken(await mint(cfg.resource,cfg.issuer,'-1s'),publicKey,cfg,'mcp'));
 await assert.rejects(verifyAccessToken(await mint(),other.publicKey,cfg,'mcp'));
});
