#!/usr/bin/env node
import {fileURLToPath} from 'node:url';
import {createLoopbackMcpServer} from '../src/mcp-http-server.mjs';

const flag=key=>{const i=process.argv.indexOf(key);return i>=0?process.argv[i+1]:null;};
if(process.argv.includes('--allow-write')||flag('--host')&&!['127.0.0.1','localhost'].includes(flag('--host'))){
  console.error('E_REMOTE_WRITES_OR_PUBLIC_BIND_FORBIDDEN');
  process.exit(2);
}
const port=Number(flag('--port')??4174);
if(!Number.isInteger(port)||port<0||port>65535){
  console.error('E_PORT_INVALID');
  process.exit(2);
}
const editorDir=flag('--editor-dir')||process.env.INHA_WORLD_EDITOR_DIR||
  fileURLToPath(new URL('../compat/inha-editor/',import.meta.url));
try{
  const server=await createLoopbackMcpServer({editorDir,worldFile:flag('--world')});
  server.listen(port,'127.0.0.1',()=>{
    const address=server.address();
    console.log('ALDOL Studio MCP HTTP (localhost-only, read-only, unauthenticated development): http://127.0.0.1:'+address.port+'/mcp');
  });
}catch(e){
  console.error('E_MCP_HTTP_START:',e.message);
  process.exit(2);
}
