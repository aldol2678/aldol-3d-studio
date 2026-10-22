import {validatePng} from '/src/png-contract.mjs';
import {WorldDocument,createEmptyWorld} from '/compat/inha-editor/world-document.js';
import {EditorCommands} from '/compat/inha-editor/editor-commands.js';
import {parseWorld,serializeWorld} from '/compat/inha-editor/world-serialization.js';
import {validateWorld} from '/compat/inha-editor/world-schema.js';
import {validateCommand} from '/command-schema.mjs';
import {validateRenderGlb} from '/glb-contract.mjs';
import {applySceneCommand} from '/src/scene-command-core.mjs';
import {safeKey} from '/command-schema.mjs';
import {makeStoredZip} from '/pwa/zip.mjs';

const nativeFetch=window.fetch.bind(window);
const DB='aldol-3d-studio-pwa-v1', MAX_FILE=20*1024*1024, MAX_TOTAL=80*1024*1024;
const encoder=new TextEncoder();
function openDb(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('state');db.createObjectStore('assets',{keyPath:'assetId'});};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
const db=await openDb();
function get(store,key){return new Promise((resolve,reject)=>{const req=db.transaction(store,'readonly').objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function keys(store){return new Promise((resolve,reject)=>{const r=db.transaction(store,'readonly').objectStore(store).getAllKeys();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function all(store){return new Promise((resolve,reject)=>{const req=db.transaction(store,'readonly').objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function put(store,value,key){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,...(key===undefined?[]:[key]));tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('E_LOCAL_SAVE'));tx.onerror=()=>reject(tx.error);});}
const record=await get('state','current');
let world=new WorldDocument(record?.world?parseWorld(record.world):createEmptyWorld({worldId:'aldol.studio.pwa',name:'ALDOL 3D Studio Local PWA'}));
const state={selectedEntityId:null,select(id){this.selectedEntityId=id;},clearSelection(){this.selectedEntityId=null;}};
let commands=new EditorCommands(world,state);
const localKey=record?.localKey||'legacy-local-project';
let serial=record?.serial||0;
let revision='scene:'+serial+':local';
const receipts=new Map();
async function save(){
  const next=serial+1;
  await put('state',{serial:next,localKey,world:serializeWorld(world.snapshot())},'current');
  serial=next;revision='scene:'+serial+':local';
  window.dispatchEvent(new Event('studio-local-saved'));
}
function read(){
 const w=world.snapshot();
 return {sceneId:w.worldId,coordinateSystem:w.coordinateSystem,revisionToken:revision,previewActive:false,
  nodes:w.entities.map(e=>({id:e.id,name:e.name,parentId:e.parentId,enabled:e.enabled,transform:e.transform,tags:e.tags,
   componentKeys:Object.keys(e.components??{}),renderAssetId:e.components?.['core.renderable']?.assetId??null,source:'local-pwa'})),
  capabilities:['node.read','node.create','node.rename','node.transform','node.duplicate','node.delete','node.reparent','asset.inspect']};
}
const result=(status,commandId,diagnosticCode)=>({status,commandId,revisionToken:revision,...(diagnosticCode?{diagnosticCode}:{})});
async function dispatch(c){
 if(!c||validateCommand(c))return result('rejected',String(c?.commandId||''),validateCommand(c)||'E_COMMAND_INVALID');
 if(receipts.has(c.commandId)){const old=receipts.get(c.commandId);return old.key===safeKey(c)?old.result:result('rejected',c.commandId,'E_COMMAND_ID_REUSE');}
 if(c.expectedRevision!==revision)return result('conflict',c.commandId,'E_REVISION_STALE');
 const p=c.payload;let changed=false;
 try{
  const before=serializeWorld(world.snapshot());
  changed=applySceneCommand(world,commands,validateWorld,c);
  if(changed){try{await save();}catch(e){world=new WorldDocument(parseWorld(before));commands=new EditorCommands(world,state);throw e;}}
  receipts.set(c.commandId,{key:safeKey(c),result:result(changed?'applied':'unchanged',c.commandId)});
  if(receipts.size>500)receipts.delete(receipts.keys().next().value);
  return result(changed?'applied':'unchanged',c.commandId);
 }catch(e){return result('rejected',c.commandId,e.message?.split(':')[0]||'E_COMMAND_FAILED');}
}
async function history(which,expectedRevision){
 if(expectedRevision!==revision)return result('conflict',which,'E_REVISION_STALE');
 const before=serializeWorld(world.snapshot());
 try{const ok=commands[which]();if(ok)await save();return result(ok?'applied':'unchanged',which);}
 catch(e){world=new WorldDocument(parseWorld(before));commands=new EditorCommands(world,state);return result('rejected',which,e.message);}
}
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
function base64Bytes(s){
 if(typeof s!=='string'||s.length>MAX_FILE*4/3+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error('E_IMPORT_BASE64');
 const raw=atob(s),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return bytes;
}
const scanPng=validatePng;
async function importAsset(a){
 if(!a||typeof a.file!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,180}\.(?:glb|png)$/i.test(a.file)||a.file.includes('..'))throw Error('E_IMPORT_TYPE');
 const bytes=base64Bytes(a.contentsBase64);
 if(bytes.length<1||bytes.length>MAX_FILE)throw Error('E_IMPORT_SIZE');
 const manifest=a.manifest?.arguments??a.manifest?.inventory_preview?.arguments??a.manifest;
 if(!manifest||typeof manifest.project_id!=='string'||!Array.isArray(manifest.assets))throw Error('E_FACTORY_MANIFEST_INVALID');
 const entry=manifest.assets.find(x=>x.file==='assets/'+a.file);
 if(!entry||entry.status==='FAIL'||entry.byte_size!==bytes.length)throw Error('E_IMPORT_MANIFEST_MISMATCH');
 const digest=await hash(bytes);
 if(!entry.sha256||digest!==entry.sha256)throw Error('E_IMPORT_SHA_MISMATCH');
 const extension=a.file.split('.').at(-1).toLowerCase();
 const structure=extension==='glb'?{format:'glb',...validateRenderGlb(bytes)}:scanPng(bytes);
 const id='factory.'+digest.slice(0,24);
 const previous=await get('assets',id);
 if(previous)return {...publicAsset(previous),alreadyImported:true};
 const rows=await all('assets');if(rows.reduce((total,r)=>total+r.byteSize,bytes.length)>MAX_TOTAL)throw Error('E_FACTORY_TOO_LARGE');
 const uri='assets/'+digest+'.'+extension;
 const asset={id,type:extension==='glb'?'model':'texture',uri,metadata:{sha256:digest,source:'aldol-asset-factory-v5.1-local-export',sourceFile:a.file,projectId:manifest.project_id,byteSize:bytes.length,structure,rightsQa:'UNKNOWN',engineImportQa:'UNKNOWN',contentIntegrity:'PASS'}};
 commands.addAsset(asset);
 const value={assetId:id,uri,file:a.file,projectId:manifest.project_id,byteSize:bytes.length,sha256:digest,structure,bytes,
  content_integrity:'PASS',rights_qa:'UNKNOWN',engine_import_qa:'UNKNOWN',visual_qa:'UNKNOWN'};
 try{await put('assets',value);await save();}catch(e){commands.undo();throw e;}
 return publicAsset(value);
}
const publicAsset=({bytes,...metadata})=>metadata;
const headers={'cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'content-type':'application/json; charset=utf-8'}});
async function blobDownload(name,bytes,mime){
 const link=document.createElement('a'),url=URL.createObjectURL(new Blob([bytes],{type:mime}));
 link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function exportBundle(){
 const records=await all('assets'),w=world.snapshot();
 const files=[{name:'world.json',bytes:encoder.encode(serializeWorld(w))}];
 for(const asset of w.assets){
  const rec=records.find(r=>r.assetId===asset.id);
  if(!rec)throw Error('E_ARCHIVE_ASSET_MISSING:'+asset.id);
  files.push({name:rec.uri,bytes:rec.bytes});
 }
 const zip=makeStoredZip(files);
 await blobDownload('aldol-studio-scene-assets.zip',zip,'application/zip');
}
let writeQueue=Promise.resolve();
const enqueue=fn=>{const task=writeQueue.then(fn);writeQueue=task.catch(()=>{});return task;};
async function api(path,options={}){
 const method=(options.method||'GET').toUpperCase(),u=new URL(path,location.href),key=u.pathname;
 try{
  if(method==='GET'&&key==='/api/health')return json({status:'ok',mode:'pwa-local',allowWrite:true,sessionOnly:false,offlineReady:true});
  if(method==='GET'&&key==='/api/scene')return json(read());
  if(method==='GET'&&key==='/api/validate')return json(validateWorld(world.snapshot()));
  if(method==='GET'&&key==='/api/export')return new Response(serializeWorld(world.snapshot()),{headers:{...headers,'content-type':'application/json'}});
  if(method==='GET'&&key==='/api/assets')return json({assets:(await all('assets')).filter(r=>world.snapshot().assets.some(a=>a.id===r.assetId)).map(publicAsset),sessionOnly:false});
  if(method==='GET'&&/^\/api\/assets\/factory\.[a-f0-9]{24}$/.test(key)){
   const asset=await get('assets',key.slice('/api/assets/'.length));
   return asset?new Response(asset.bytes,{headers:{...headers,'content-type':asset.structure.format==='glb'?'model/gltf-binary':'image/png'}}):json({error:'E_ASSET_NOT_FOUND'},404);
  }
  if(method!=='POST')return json({error:'E_METHOD_NOT_ALLOWED'},405);
  const a=JSON.parse(options.body||'{}');
  if(key==='/api/command')return json(await enqueue(()=>dispatch(a)));
  if(key==='/api/undo'||key==='/api/redo')return json(await enqueue(()=>history(key.endsWith('undo')?'undo':'redo',a.expectedRevision)));
  if(key==='/api/assets/import')return json(await enqueue(()=>importAsset(a)));
  return json({error:'E_NOT_FOUND'},404);
 }catch(e){return json({error:e.message||'E_PWA_REQUEST'},400);}
}
window.fetch=(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.origin===location.origin&&url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/api/cloud')&&!url.pathname.startsWith('/api/mcp')&&url.pathname!=='/api/asset')return api(url.href,init??{});
 return nativeFetch(input,init);
};
window.__ALDOL_PWA__={
 downloadWorld:()=>blobDownload('aldol-studio-world.json',encoder.encode(serializeWorld(world.snapshot())),'application/json'),
 exportBundle,readScene:()=>read(),offline:true,nativeFetch,
 currentLocalKey:()=>localKey,assetRecords:()=>all('assets'),
 localProjects:async()=>{const ids=(await keys('state')).filter(k=>typeof k==='string'&&(k.startsWith('local:')||k.startsWith('backup-')));return Promise.all(ids.map(async id=>({id,...await get('state',id)})));},
 saveLocalProject:async name=>{const id='local:'+crypto.randomUUID();await put('state',{name,world:serializeWorld(world.snapshot()),savedAt:Date.now()},id);return id;},

 snapshot:()=>JSON.parse(serializeWorld(world.snapshot())),
 loadWorld:(candidate,options={})=>enqueue(async()=>{
   const text=serializeWorld(candidate),nextLocalKey=crypto.randomUUID();
   await new Promise((resolve,reject)=>{
     const tx=db.transaction(['state','assets'],'readwrite'),store=tx.objectStore('state');
     store.put({serial,world:serializeWorld(world.snapshot())},'backup-'+Date.now());
     store.put({serial:serial+1,localKey:nextLocalKey,world:text},'current');
     if(options.key)store.put(options.binding?{...options.binding,localKey:nextLocalKey}:null,'sync:'+options.key);
     for(const record of options.assets||[])tx.objectStore('assets').put(record);
     tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('E_LOCAL_SAVE'));
   });
   location.reload();
 }),
 syncGet:key=>get('state','sync:'+key),syncPut:(key,value)=>put('state',value,'sync:'+key),

};
const bundle=document.getElementById('asset-bundle');
bundle?.addEventListener('click',e=>{e.preventDefault();exportBundle().catch(error=>{
 const status=document.getElementById('status');if(status)status.textContent='백업 실패: '+error.message;
});});
const conn=document.getElementById('connection');
if(conn)conn.textContent='● 로컬 기기 저장 · 오프라인 지원';
