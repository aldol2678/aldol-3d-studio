import {WorldDocument,createEmptyWorld} from '/compat/inha-editor/world-document.js';
import {EditorCommands} from '/compat/inha-editor/editor-commands.js';
import {parseWorld,serializeWorld} from '/compat/inha-editor/world-serialization.js';
import {validateWorld} from '/compat/inha-editor/world-schema.js';
import {validateCommand} from '/command-schema.mjs';
import {validateRenderGlb} from '/glb-contract.mjs';
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
function all(store){return new Promise((resolve,reject)=>{const req=db.transaction(store,'readonly').objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function put(store,value,key){return new Promise((resolve,reject)=>{const req=db.transaction(store,'readwrite').objectStore(store).put(value,...(key===undefined?[]:[key]));req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);});}
const record=await get('state','current');
const world=new WorldDocument(record?.world?parseWorld(record.world):createEmptyWorld({worldId:'aldol.studio.pwa',name:'ALDOL 3D Studio Local PWA'}));
const state={selectedEntityId:null,select(id){this.selectedEntityId=id;},clearSelection(){this.selectedEntityId=null;}};
const commands=new EditorCommands(world,state);
let serial=record?.serial||0;
let revision='scene:'+serial+':local';
const receipts=new Map();
async function save(){
  serial++;revision='scene:'+serial+':local';
  await put('state',{serial,world:serializeWorld(world.snapshot())},'current');
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
 if(receipts.has(c.commandId))return result('rejected',c.commandId,'E_COMMAND_ID_REUSE');
 if(c.expectedRevision!==revision)return result('conflict',c.commandId,'E_REVISION_STALE');
 const p=c.payload;let changed=false;
 try{
  const existing=c.targetId&&world.getEntity(c.targetId);
  if(c.operation==='node.create'){commands.addEntity(p);changed=true;}
  else if(!existing)throw Error('E_ENTITY_NOT_FOUND');
  else if(c.operation==='node.rename')changed=commands.renameEntity(c.targetId,p.name)!==false;
  else if(c.operation==='node.transform')changed=commands.setTransform(c.targetId,p.transform)!==false;
  else if(c.operation==='node.duplicate'){commands.duplicateEntity(c.targetId);changed=true;}
  else if(c.operation==='node.delete'){
    if(world.listEntities().some(n=>n.parentId===c.targetId))throw Error('E_ENTITY_HAS_CHILDREN');
    changed=commands.removeEntity(c.targetId);
  }else if(c.operation==='node.reparent')changed=commands.replaceEntity(c.targetId,{...existing,parentId:p.parentId},'Reparent Entity');
  else throw Error('E_OPERATION_UNSUPPORTED');
  if(changed){await save();receipts.set(c.commandId,true);if(receipts.size>100)receipts.delete(receipts.keys().next().value);}
  return result(changed?'applied':'unchanged',c.commandId);
 }catch(e){return result('rejected',c.commandId,e.message?.split(':')[0]||'E_COMMAND_FAILED');}
}
async function history(which,expectedRevision){
 if(expectedRevision!==revision)return result('conflict',which,'E_REVISION_STALE');
 try{const ok=commands[which]();if(ok)await save();return result(ok?'applied':'unchanged',which);}
 catch(e){return result('rejected',which,e.message);}
}
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
function base64Bytes(s){
 if(typeof s!=='string'||s.length>MAX_FILE*4/3+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error('E_IMPORT_BASE64');
 const raw=atob(s),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return bytes;
}
function scanPng(bytes){
 const u=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<33||u.getUint32(0)!==0x89504e47||u.getUint32(12)!==0x49484452)throw Error('E_PNG_INVALID');
 const width=u.getUint32(16),height=u.getUint32(20);
 if(!width||!height||width>16384||height>16384)throw Error('E_PNG_DIMENSIONS');
 return {format:'png',width,height};
}
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
  if(key==='/api/command')return json(await dispatch(a));
  if(key==='/api/undo'||key==='/api/redo')return json(await history(key.endsWith('undo')?'undo':'redo',a.expectedRevision));
  if(key==='/api/assets/import')return json(await importAsset(a));
  return json({error:'E_NOT_FOUND'},404);
 }catch(e){return json({error:e.message||'E_PWA_REQUEST'},400);}
}
window.fetch=(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.origin===location.origin&&url.pathname.startsWith('/api/'))return api(url.href,init??{});
 return nativeFetch(input,init);
};
window.__ALDOL_PWA__={
 downloadWorld:()=>blobDownload('aldol-studio-world.json',encoder.encode(serializeWorld(world.snapshot())),'application/json'),
 exportBundle,readScene:()=>read(),offline:true,
};
const bundle=document.getElementById('asset-bundle');
bundle?.addEventListener('click',e=>{e.preventDefault();exportBundle().catch(error=>{
 const status=document.getElementById('status');if(status)status.textContent='백업 실패: '+error.message;
});});
const conn=document.getElementById('connection');
if(conn)conn.textContent='● 로컬 기기 저장 · 오프라인 지원';
