import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createLoopbackMcpServer} from '../src/mcp-http-server.mjs';

const editorDir=resolve('compat/inha-editor');
const request=(id,method,params={})=>({jsonrpc:'2.0',id,method,params});

async function withServer(fn){
  const server=await createLoopbackMcpServer({editorDir});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  const post=async(payload,extras={})=>fetch(base+'/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream',...extras},body:typeof payload==='string'?payload:JSON.stringify(payload)});
  try{await fn({base,post});}
  finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
}

test('loopback HTTP MCP initializes, lists 7 read-only tools, validates motion, and preserves JSON-RPC ids',async()=>{
  await withServer(async({base,post})=>{
    const health=await fetch(base+'/health');assert.equal(health.status,200);
    const info=await health.json();
    assert.deepEqual({readOnly:info.readOnly,remoteReady:info.remoteReady,scope:info.scope}, {readOnly:true,remoteReady:false,scope:'loopback-only'});
    const init=await (await post(request(1,'initialize',{protocolVersion:'2025-06-18',capabilities:{}}))).json();
    assert.equal(init.id,1);assert.equal(init.result.protocolVersion,'2025-06-18');
    const response=await (await post(request('tools','tools/list'))).json();
    assert.equal(response.id,'tools');
    const names=response.result.tools.map(x=>x.name);
    assert.equal(names.length,7);
    for(const name of ['scene_read','scene_validate','scene_export_world','motion_library','motion_validate','motion_blend','motion_export'])assert.ok(names.includes(name),name);
    for(const name of ['motion_import','motion_retarget','scene_dispatch'])assert.ok(!names.includes(name),name);
    const scene=await (await post(request(2,'tools/call',{name:'scene_read',arguments:{}}))).json();
    assert.equal(JSON.parse(scene.result.content[0].text).sceneId,'aldol.studio.local');
    const clip={id:'idle',name:'Idle',duration:1,fps:30,skeleton:['root'],tracks:[{joint:'root',channel:'translation',frames:[{time:0,value:[0,0,0]}]}]};
    const motion=await (await post(request(3,'tools/call',{name:'motion_validate',arguments:{clip}}))).json();
    assert.equal(JSON.parse(motion.result.content[0].text).valid,true);
    const forbidden=await (await post(request(4,'tools/call',{name:'motion_import',arguments:{clip}}))).json();
    assert.equal(forbidden.error.code,-32602);
    const library=await (await post(request(5,'tools/call',{name:'motion_library',arguments:{}}))).json();
    assert.equal(JSON.parse(library.result.content[0].text).clips.length,0);
  });
});
test('HTTP method, content, protocol and browser-origin guards fail closed',async()=>{
  await withServer(async({base,post})=>{
    assert.equal((await fetch(base+'/mcp')).status,405);
    assert.equal((await fetch(base+'/wrong')).status,404);
    assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})).status,415);
    assert.equal((await post(request(1,'ping'),{'mcp-protocol-version':'2099-01-01'})).status,400);
    assert.equal((await post(request(1,'ping'),{origin:'https://evil.example'})).status,403);
    const badHostStatus=await new Promise((resolve,reject)=>{
      const endpoint=new URL(base);
      const req=httpRequest({hostname:'127.0.0.1',port:Number(endpoint.port),path:'/mcp',method:'POST',
        headers:{host:'evil.example','content-type':'application/json'}},res=>{
        res.resume();res.on('end',()=>resolve(res.statusCode));
      });
      req.on('error',reject);
      req.end(JSON.stringify(request(1,'ping')));
    });
    assert.equal(badHostStatus,403);
    assert.equal((await post([request(1,'ping')])).status,400);
    assert.equal((await post('not json')).status,400);
    assert.equal((await post(' '.repeat(2*1024*1024+1))).status,413);
    const notification=await post({jsonrpc:'2.0',method:'notifications/initialized'});
    assert.equal(notification.status,202);
    assert.equal(await notification.text(),'');
    const ok=await (await post(request(2,'ping'))).json();assert.deepEqual(ok.result,{});
    const headers=(await post(request(3,'ping'))).headers;
    assert.equal(headers.get('access-control-allow-origin'),null);
    assert.equal(headers.get('cache-control'),'no-store');
  });
});
test('HTTP CLI refuses write flags and remote listener host',()=>{
  const run=flags=>spawnSync(process.execPath,['bin/mcp-http.mjs',...flags],{cwd:resolve('.'),encoding:'utf8',timeout:5000});
  const a=run(['--allow-write']);assert.equal(a.status,2);assert.match(a.stderr,/E_REMOTE_WRITES_OR_PUBLIC_BIND_FORBIDDEN/);
  const b=run(['--host','0.0.0.0']);assert.equal(b.status,2);assert.match(b.stderr,/E_REMOTE_WRITES_OR_PUBLIC_BIND_FORBIDDEN/);
});
