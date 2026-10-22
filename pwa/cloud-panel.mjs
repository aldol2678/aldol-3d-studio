import {serializeWorld} from '/compat/inha-editor/world-serialization.js';
import {validatePng} from '/src/png-contract.mjs';
import {createClient} from '/vendor/supabase.mjs';
import {validateRenderGlb} from '/glb-contract.mjs';
const local=window.__ALDOL_PWA__,fetchNet=local.nativeFetch;
const panel=document.createElement('details');panel.id='cloud-panel';panel.className='cloud-panel';
panel.innerHTML=`<summary>프로젝트 · 클라우드 동기화</summary>
 <p>기기 저장은 항상 유지됩니다. 로그인 후 동기화를 선택한 프로젝트만 업로드합니다.</p>
 <div class="cloud-actions"><button id="local-save">기기에 사본 저장</button><select id="local-project"><option value="">로컬 프로젝트 · 복구본</option></select><button id="local-load">로컬 불러오기</button></div>
 <form id="cloud-login"><label>이메일<input name="email" type="email" autocomplete="username" required></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" required minlength="6"></label><button>로그인</button></form>
 <div id="cloud-session" hidden><span id="cloud-account"></span><button id="cloud-logout">로그아웃</button>
 <div class="cloud-actions"><button id="cloud-list">목록 새로고침</button><button id="cloud-create">현재 장면을 새 프로젝트로 저장</button><button id="cloud-sync">선택 프로젝트에 동기화</button><button id="cloud-pull">클라우드 버전 불러오기</button><button id="cloud-history">변경 이력</button></div>
 <label>클라우드 프로젝트<select id="cloud-project"><option value="">프로젝트 선택</option></select></label>
 <label><input type="checkbox" id="cloud-auto">선택한 프로젝트 자동 동기화 (온라인 복귀 포함)</label>
 <div id="cloud-history-list"></div></div>
 <p id="cloud-status" role="status" aria-live="polite">클라우드 연결 확인 중 · 로컬 편집 가능</p>`;
document.querySelector('.pwa-note')?.replaceWith(panel);
const el=id=>document.getElementById(id),status=text=>{el('cloud-status').textContent=text;};
let client,user,binding=null,busy=false,timer;
async function listLocal(){const select=el('local-project');select.replaceChildren(new Option('로컬 프로젝트 · 복구본',''));for(const p of await local.localProjects())select.add(new Option(p.name||('자동 복구본 '+new Date(Number(p.id.slice(7))).toLocaleString()),p.id));}
el('local-save').onclick=async()=>{try{await local.saveLocalProject(local.snapshot().name+' · '+new Date().toLocaleString());await listLocal();status('기기에 별도 사본을 저장했습니다.');}catch(e){status('로컬 저장 실패: '+e.message);}};
el('local-load').onclick=async()=>{try{const p=(await local.localProjects()).find(p=>p.id===el('local-project').value);if(!p)return;await local.loadWorld(JSON.parse(p.world),user?{key:user.id,binding:null}:{});}catch(e){status('불러오기 실패: '+e.message);}};
await listLocal();
const key=()=>user.id;
const worldKey=w=>serializeWorld(w);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
async function authHeaders(){const {data,error}=await client.auth.getSession();if(error||!data.session||data.session.user.id!==user?.id)throw Error('다시 로그인해 주세요.');return {Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'};}
async function call(tool,args){const r=await fetchNet('/api/cloud',{method:'POST',headers:await authHeaders(),body:JSON.stringify({tool,arguments:args}),signal:AbortSignal.timeout(25000)});const data=await r.json();if(!r.ok){const e=Error(data.error||'E_CLOUD');e.status=r.status;throw e;}return data;}
async function list(){const data=await call('project_list',{}),select=el('cloud-project');select.replaceChildren(new Option('프로젝트 선택',''));for(const p of data.projects)select.add(new Option(p.name+' · v'+p.version,p.id));if(binding)select.value=binding.projectId;}
function showBinding(){el('cloud-auto').checked=Boolean(binding?.auto);status(binding?`기기 + 클라우드 · v${binding.version} · 마지막 동기화 ${new Date(binding.at).toLocaleString()}`:'기기 내부 프로젝트 · 아직 동기화하지 않았습니다.');}
async function persist(){await local.syncPut(key(),binding);}
async function uploadAssets(projectId,world){const records=await local.assetRecords();for(const a of world.assets){
 const r=records.find(x=>x.assetId===a.id);if(!r)throw Error('에셋 원본이 기기에 없습니다: '+a.id);
 if(r.byteSize>3145728)throw Error('클라우드 에셋은 파일당 3MB까지 지원합니다. 로컬 원본은 유지됩니다.');
 let text='';for(let i=0;i<r.bytes.length;i+=8192)text+=String.fromCharCode(...r.bytes.subarray(i,i+8192));
 const response=await fetchNet('/api/asset',{method:'POST',headers:await authHeaders(),body:JSON.stringify({projectId,sha256:r.sha256,mime:r.structure.format==='png'?'image/png':'model/gltf-binary',base64:btoa(text)}),signal:AbortSignal.timeout(25000)});
 const data=await response.json();if(!response.ok)throw Error(data.error||'E_UPLOAD');
 }}
async function pendingFlush(){const pending=await local.syncGet(key()+':pending');if(!pending)return;
 const saved=await call(pending.tool,pending.args);
 binding={...binding,...(pending.tool==='project_create'?{auto:false}:{}),localKey:local.currentLocalKey(),projectId:saved.id,version:saved.version,world:pending.world,at:Date.now()};await persist();await local.syncPut(key()+':pending',null);
}
async function sync(create=false){if(!user||busy)return;busy=true;try{
 if(!navigator.onLine)throw Error('오프라인 · 기기에 저장됨. 온라인 복귀 후 동기화할 수 있습니다.');
 await pendingFlush();const world=local.snapshot();
 if(create){
  // Create an empty cloud project first; only commit asset references after byte verification.
  const projectId=crypto.randomUUID(),requestId=crypto.randomUUID();
  const args={projectId,name:world.name||'Studio project',requestId};
  const pending={tool:'project_create',args,world:null};await local.syncPut(key()+':pending',pending);await pendingFlush();
 }
 if(!binding)throw Error('먼저 새 프로젝트로 저장하거나 클라우드 프로젝트를 불러오세요.');
 if(!create&&el('cloud-project').value!==binding.projectId)throw Error('목록에서 선택한 프로젝트를 먼저 불러오세요. 현재 로컬 장면은 그대로 유지됩니다.');
 if(binding.world===worldKey(world)){showBinding();return;}
 const remote=await call('project_get',{projectId:binding.projectId});
 if(remote.version!==binding.version)throw Error('동기화 충돌: 클라우드가 변경되었습니다. 새 프로젝트로 보존하거나 클라우드 버전을 불러오세요.');
 status('에셋 검사 및 동기화 중…');await uploadAssets(binding.projectId,world);
 const args={projectId:binding.projectId,expectedVersion:binding.version,requestId:crypto.randomUUID(),world};
 await local.syncPut(key()+':pending',{tool:'project_save',args,world:worldKey(world)});await pendingFlush();
 await list();showBinding();
 }catch(e){if(e.status===409)await local.syncPut(key()+':pending',null);status('저장 상태: '+e.message+' · 로컬 데이터는 유지됩니다.');}finally{busy=false;}}
async function downloadAssets(project){const records=await local.assetRecords(),out=[];
 for(const asset of project.world.assets){const sha=asset.metadata?.sha256;if(!sha)throw Error('클라우드 원본을 확인할 수 없는 에셋: '+asset.id);
  let existing=records.find(x=>x.assetId===asset.id&&x.sha256===sha);
  if(existing&&await hash(existing.bytes)===sha){out.push(existing);continue;}
  const {data:row,error}=await client.from('studio_assets').select('*').eq('project_id',project.id).eq('sha256',sha).single();if(error||!row)throw Error('에셋 원본이 업로드되지 않았습니다: '+asset.id);
  const {data,error:err}=await client.storage.from('studio-assets').download(row.path);if(err)throw Error('에셋 다운로드 실패');
  const bytes=new Uint8Array(await data.arrayBuffer());if(await hash(bytes)!==sha)throw Error('에셋 무결성 오류');
  const structure=row.mime==='model/gltf-binary'?{format:'glb',...validateRenderGlb(bytes)}:validatePng(bytes);
  out.push({assetId:asset.id,uri:asset.uri,file:asset.metadata?.sourceFile||sha+'.'+(structure.format==='png'?'png':'glb'),projectId:project.id,byteSize:bytes.length,sha256:sha,structure,bytes});
 }return out;}
async function pull(){if(busy)return;busy=true;try{
 const projectId=el('cloud-project').value;if(!projectId)throw Error('프로젝트를 선택하세요.');
 if(await local.syncGet(key()+':pending'))throw Error('응답이 확인되지 않은 저장 요청이 있습니다. 먼저 동기화를 눌러 확인하세요.');
 const p=await call('project_get',{projectId}),assets=await downloadAssets(p);
 const next={projectId,version:p.version,world:worldKey(p.world),at:Date.now(),auto:false};
 await local.loadWorld(p.world,{key:key(),binding:next,assets});
 }catch(e){status(e.message+' · 현재 장면 유지');}finally{busy=false;}}
async function history(){const projectId=el('cloud-project').value;if(!projectId)return;const data=await call('project_history',{projectId,limit:20});const host=el('cloud-history-list');host.replaceChildren();for(const h of data.history){const b=document.createElement('button');b.textContent=`v${h.version} ${h.action} · 복구`;b.onclick=()=>run(async()=>{if(!confirm('이 버전을 새 클라우드 리비전으로 복구할까요? 현재 기기 장면은 유지됩니다.'))return;const p=await call('project_get',{projectId});await call('project_restore',{projectId,version:h.version,expectedVersion:p.version,requestId:crypto.randomUUID()});status('클라우드 복구 완료. 불러오기를 누르면 기기에도 반영됩니다.');});host.append(b);}}
const run=fn=>Promise.resolve().then(fn).catch(e=>status(e.message));
try{
 const r=await fetchNet('/api/cloud',{signal:AbortSignal.timeout(10000)}),c=await r.json();if(!c.configured)throw Error('클라우드 설정 대기 · 로컬 편집 가능');
 client=createClient(c.supabaseUrl,c.publishableKey,{auth:{storageKey:'aldol-studio-auth-v1',flowType:'pkce',detectSessionInUrl:true}});
 const session=await client.auth.getSession();user=session.data.session?.user;
 async function show(){el('cloud-login').hidden=Boolean(user);el('cloud-session').hidden=!user;if(user){el('cloud-account').textContent=user.email||'로그인됨';binding=await local.syncGet(key());if(binding?.localKey!==local.currentLocalKey())binding=null;await list();showBinding();}else status('기기 내부 저장 · 로그인 후 수동 동기화');}
 el('cloud-login').onsubmit=e=>{e.preventDefault();run(async()=>{const f=new FormData(e.target);const {data,error}=await client.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});e.target.password.value='';if(error)throw Error('로그인 실패. 계정과 비밀번호를 확인하세요.');user=data.user;await show();});};
 el('cloud-logout').onclick=()=>run(async()=>{await client.auth.signOut();user=null;binding=null;await show();});
 el('cloud-list').onclick=()=>run(list);el('cloud-create').onclick=()=>sync(true);el('cloud-sync').onclick=()=>sync();el('cloud-pull').onclick=pull;el('cloud-history').onclick=()=>run(history);
 el('cloud-auto').onchange=()=>run(async()=>{if(!binding)throw Error('프로젝트를 먼저 동기화하세요.');binding.auto=el('cloud-auto').checked;await persist();if(binding.auto)sync();});
 window.addEventListener('studio-local-saved',()=>{if(!binding?.auto){if(binding)status('기기에 저장됨 · 클라우드 동기화 대기');return;}clearTimeout(timer);timer=setTimeout(()=>sync(),3000);});
 window.addEventListener('online',()=>{if(binding?.auto)sync();});window.addEventListener('offline',()=>status('오프라인 · 기기 내부 저장 중'));
 await show();
}catch(e){status(e.message);}
