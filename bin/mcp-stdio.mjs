#!/usr/bin/env node
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {createStudioMcpRuntime} from '../src/mcp-runtime.mjs';

const getFlag=key=>{const i=process.argv.indexOf(key);return i>=0?process.argv[i+1]:null;};
const editorDir=getFlag('--editor-dir')||process.env.INHA_WORLD_EDITOR_DIR||
  fileURLToPath(new URL('../compat/inha-editor/',import.meta.url));
let runtime;
try{runtime=await createStudioMcpRuntime({editorDir,worldFile:getFlag('--world'),allowWrite:process.argv.includes('--allow-write')});}
catch(e){console.error('E_LEGACY_LOAD_FAILED:',e.message);process.exit(2);}
const io=createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of io){
  if(!line.trim())continue;
  let request;
  try{request=JSON.parse(line);}
  catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');continue;}
  if(request.id===undefined)continue; // JSON-RPC notifications receive no response.
  try{
    const result=await runtime.handle(request);
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
  }catch(e){
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:e.code||-32603,message:e.message||'Internal error'}})+'\n');
  }
}
