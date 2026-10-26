import {createLocalInventory} from './asset-catalog-data.mjs';
// Asset Factory v5.1 offline handoff panel. No cross-origin fetch or remote upload.
const el=id=>document.getElementById(id);
const root=el('factory-assets'),file=el('factory-file'),manifest=el('factory-manifest'),button=el('factory-import');
const localButton=el('factory-local-import'),rightsAck=el('factory-rights-ack'),localStatus=el('factory-local-status');
const text=(node,value)=>{node.textContent=value;return node;};
async function json(path,options){const r=await fetch(path,{cache:'no-store',...options});const data=await r.json();if(!r.ok)throw Error(data.error||'E_FACTORY_REQUEST');return data;}
async function list(){
 try {
  const {assets}=await json('/api/assets');root.replaceChildren();
  if(!assets.length){text(root,'아직 등록된 로컬 에셋이 없습니다.');return;}
  for(const item of assets){
   const line=document.createElement('div');line.className='factory-asset';
   const name=document.createElement('span');text(name,item.file+' · '+item.structure.format.toUpperCase());
   const place=document.createElement('button');text(place,'모델 배치');place.type='button';
   place.disabled=item.structure.format!=='glb'||!canWrite;
   place.title='검증된 GLB를 PlayCanvas 장면에 배치합니다. 지원하지 않는 모델은 오류로 표시합니다.';
   place.addEventListener('click',async()=>{
    place.disabled=true;
    try{
     const snapshot=await json('/api/scene');
     const payload={
      id:'factory-placement.'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)),
      name:item.file,kind:'prop',parentId:null,
      transform:{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},
      components:{'core.renderable':{assetId:item.assetId}},
      metadata:{assetFactory:{projectId:item.projectId,sha256:item.sha256,rightsQa:'UNKNOWN',engineImportQa:'UNKNOWN'}}
     };
     const r=await json('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commandId:'factory.place.'+Date.now()+'.'+Math.random(),expectedRevision:snapshot.revisionToken,operation:'node.create',payload})});
     if(r.status!=='applied')throw Error(r.diagnosticCode||r.status);
     text(el('status'),'Factory 모델 배치됨 · GLB 로딩 상태를 확인하세요');
     window.dispatchEvent(new Event('studio:external-change'));
    }catch(e){text(el('status'),'에셋 배치 거부: '+e.message);}
    finally{place.disabled=false;}
   });
   line.append(name,place);root.append(line);
  }
 }catch(e){text(root,'에셋 목록 오류: '+e.message);}
}
let canWrite=false;
const update=()=>{button.disabled=!canWrite||!file.files?.length||!manifest.files?.length;localButton.disabled=!canWrite||!file.files?.length||!rightsAck.checked;};
rightsAck.addEventListener('change',update);
window.addEventListener('studio:asset-source-selected',()=>{rightsAck.checked=false;update();});
file.addEventListener('change',update);manifest.addEventListener('change',update);
button.addEventListener('click',async()=>{
 if(!canWrite)return;
 button.disabled=true;
 try{
  const chosen=file.files?.[0],meta=manifest.files?.[0];
  if(!chosen||!meta)throw Error('원본 파일과 Factory JSON이 모두 필요합니다');
  if(chosen.size>20*1024*1024||meta.size>256*1024)throw Error('E_FACTORY_INPUT_TOO_LARGE');
  const raw=JSON.parse(await meta.text());
  const data=await chosen.arrayBuffer();
  const view=new Uint8Array(data);let binary='';
  // Prevent stack/argument limits when converting up to 20 MiB.
  for(let i=0;i<view.length;i+=32768)binary+=String.fromCharCode(...view.subarray(i,i+32768));
  const result=await json('/api/assets/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:chosen.name,contentsBase64:btoa(binary),manifest:raw})});
  text(el('status'),'에셋 검증·등록 완료 (SHA PASS, 실제 게임 렌더링·권리 UNKNOWN)');
  await list();window.dispatchEvent(new Event('studio:external-change'));
 }catch(e){text(el('status'),'Factory 가져오기 거부: '+e.message);}
 finally{update();}
});
// Local hash manifest is generated from actual bytes; it is NOT an official Factory MCP approval.
localButton.addEventListener('click',async()=>{
 if(!canWrite||!rightsAck.checked)return;
 localButton.disabled=true;
 try{
  const chosen=file.files?.[0];
  if(!chosen)throw Error('로컬 GLB/PNG 파일을 선택하세요');
  if(chosen.size>20*1024*1024||chosen.size<1)throw Error('E_LOCAL_FILE_SIZE');
  const bytes=new Uint8Array(await chosen.arrayBuffer());
  const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
   .map(b=>b.toString(16).padStart(2,'0')).join('');
  const inventory=createLocalInventory(chosen.name,bytes.length,sha);
  let binary='';
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  const result=await json('/api/assets/import',{method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({file:chosen.name,contentsBase64:btoa(binary),manifest:inventory})});
  const message=result.alreadyImported?'이미 등록된 파일 · ':'로컬 파일 등록 완료 · ';
  text(localStatus,message+'SHA-256와 지원 구조 검사 완료. 저작권·실기기·게임 렌더링 검증은 UNKNOWN. 출처 선택 정보는 파일 메타데이터에 저장되지 않습니다.');
  text(el('status'),message+'Factory 로컬 검사');
  await list();window.dispatchEvent(new Event('studio:external-change'));
 }catch(e){text(localStatus,'로컬 등록 거부: '+e.message);text(el('status'),'로컬 등록 거부: '+e.message);}
 finally{rightsAck.checked=false;update();}
});

(async()=>{try{const h=await json('/api/health');canWrite=h.allowWrite;update();await list();}catch(e){text(root,'에셋 서비스 연결 오류: '+e.message);}})();

window.addEventListener('studio:external-change',list);
