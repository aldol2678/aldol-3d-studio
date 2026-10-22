import {validatePng} from '../src/png-contract.mjs';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {createEmptyWorld,WorldDocument} from '../compat/inha-editor/world-document.js';
import {EditorCommands} from '../compat/inha-editor/editor-commands.js';
import {parseWorld,serializeWorld} from '../compat/inha-editor/world-serialization.js';
import {validateWorld} from '../compat/inha-editor/world-schema.js';
import {WorldSceneAdapter} from '../src/world-scene-adapter.mjs';
import {MotionLibrary} from '../src/motion-library.mjs';
import {validateRenderGlb} from '../web/glb-contract.mjs';
import {StudioError} from './config.mjs';
const uuid=z.string().uuid(), id=z.string().min(1).max(100), v=z.number().int().min(1), obj=z.record(z.unknown());
const project={projectId:uuid}, mutation={...project,expectedVersion:v,requestId:uuid};
const spec=(name,shape,write=false,description=name)=>({name,schema:z.object(shape).strict(),write,description});
export const toolSpecs=[
 spec('project_list',{},false,'List your cloud projects. Device-local projects are not uploaded automatically.'),
 spec('project_get',project),spec('project_history',{...project,limit:z.number().int().min(1).max(50).default(20)}),
 spec('project_create',{projectId:uuid,name:z.string().min(1).max(100),world:obj.optional(),requestId:uuid},true),
 spec('project_save',{...mutation,world:obj},true),
 spec('project_restore',{...mutation,version:v},true,'Restore a historical snapshot as a new revision; retain all previous versions.'),
 spec('scene_read',project),spec('scene_validate',project),spec('scene_export_world',project),
 spec('scene_dispatch',{...mutation,command:obj},true),
 spec('scene_undo',mutation,true),spec('scene_redo',mutation,true),
 spec('motion_library',project,false,'List persistent motion JSON clips. Skeletal playback is not implemented.'),
 spec('motion_validate',{...project,clip:obj.optional(),id:id.optional()}),
 spec('motion_import',{...mutation,clip:obj},true),
 spec('motion_retarget',{...mutation,sourceId:id,id,name:id.optional(),targetSkeleton:z.array(id).max(128),mapping:z.record(z.string()).default({})},true,'Joint-name mapping only; no IK or bone-length compensation.'),
 spec('motion_blend',{...project,aId:id,bId:id,time:z.number().min(0),alpha:z.number().min(0).max(1)}),
 spec('motion_export',{...project,id}),
 spec('asset_list',project),spec('asset_inspect',{...project,assetId:id}),spec('asset_validate',{...project,assetId:id})
];
export const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
function dbError(error){if(!error)return;const msg=error.message||'';const code=/E_[A-Z_]+/.exec(msg)?.[0]||'E_DATABASE';throw new StudioError(code,code==='E_VERSION_CONFLICT'?409:error.code==='42501'?403:400);}
export class StudioService{
 constructor(context){this.ctx=context;this.db=context.db;}
 async get(projectId){const {data,error}=await this.db.from('studio_projects').select('*').eq('id',projectId).single();if(error||!data)throw new StudioError('E_NOT_FOUND',404);parseWorld(JSON.stringify(data.world));return data;}
 async revision(projectId,version){const {data,error}=await this.db.from('studio_revisions').select('version,world,motions').eq('project_id',projectId).eq('version',version).single();if(error||!data)throw new StudioError('E_HISTORY_NOT_FOUND',404);return data;}
 async save(p,world,motions,a,action){
  const normalized=JSON.parse(serializeWorld(world));const lib=new MotionLibrary();for(const clip of motions)lib.import(clip);
  const {data,error}=await this.db.rpc('studio_save',{p_id:p.id,p_name:p.name,p_world:normalized,p_motions:motions,p_expected:a.expectedVersion??0,p_request:a.requestId,p_hash:digest({action,args:a}),p_action:action});dbError(error);return data;
 }
 async execute(name,input){
  const spec=toolSpecs.find(t=>t.name===name);if(!spec)throw new StudioError('E_TOOL_UNKNOWN',404);
  let a;try{a=spec.schema.parse(input);}catch{throw new StudioError('E_INPUT_SCHEMA');}
  if(spec.write&&!this.ctx.canWrite)throw new StudioError('E_WRITE_SCOPE',403);
  if(name==='project_list'){const {data,error}=await this.db.from('studio_projects').select('id,name,version,updated_at').order('updated_at',{ascending:false}).limit(50);dbError(error);return {projects:data};}
  if(name==='project_create')return this.save({id:a.projectId,name:a.name},a.world??createEmptyWorld({worldId:'studio.'+a.projectId,name:a.name}),[],a,'create');
  const p=await this.get(a.projectId);
  // Check durable receipt before transforming a potentially newer snapshot.
  if(spec.write){const {data,error}=await this.db.from('studio_revisions').select('project_id,version,request_hash').eq('request_id',a.requestId).maybeSingle();dbError(error);if(data){if(data.project_id!==p.id||data.request_hash!==digest({action:actionFor(name),args:a}))throw new StudioError('E_REQUEST_ID_REUSE',409);return {id:p.id,version:data.version,replayed:true};}if(a.expectedVersion!==p.version)throw new StudioError('E_VERSION_CONFLICT',409);}
  if(name==='project_get')return p;
  if(name==='project_history'){const {data,error}=await this.db.from('studio_revisions').select('version,action,created_at').eq('project_id',p.id).order('version',{ascending:false}).limit(a.limit);dbError(error);return {history:data};}
  if(name==='project_save')return this.save(p,a.world,p.motions,a,'save');
  if(name==='project_restore'){const r=await this.revision(p.id,a.version);return this.save(p,r.world,r.motions,a,'restore');}
  const world=new WorldDocument(p.world),state={select(){},clearSelection(){}};
  const port=new WorldSceneAdapter({world,commands:new EditorCommands(world,state),serializeWorld,parseWorld,validateWorld});
  if(name==='scene_read')return {...port.read(),projectId:p.id,version:p.version};
  if(name==='scene_validate')return port.validate();
  if(name==='scene_export_world')return {world:port.exportWorld(),version:p.version};
  if(name==='scene_dispatch'){const r=await port.dispatch(a.command);if(!['applied','unchanged'].includes(r.status))throw new StudioError(r.diagnosticCode||'E_COMMAND_REJECTED',r.status==='conflict'?409:400);return this.save(p,JSON.parse(port.exportWorld()),p.motions,a,'dispatch');}
  if(name==='scene_undo'||name==='scene_redo'){return this.save(p,p.world,p.motions,a,name==='scene_undo'?'undo':'redo');}
  if(name.startsWith('motion_')){
   const lib=new MotionLibrary();for(const clip of p.motions)lib.import(clip);
   if(name==='motion_library')return {...lib.library(),sessionOnly:false};
   if(name==='motion_validate')return lib.validate(a);
   if(name==='motion_export')return {...lib.export(a.id),sessionOnly:false};
   if(name==='motion_blend')return lib.blend(a);
   const result=name==='motion_import'?lib.import(a.clip):lib.retarget(a);
   const saved=await this.save(p,p.world,[...lib.records.values()].map(r=>r.clip),a,'motion');return {...result,...saved,sessionOnly:false};
  }
  const assets=p.world.assets;
  if(name==='asset_list')return {assets};
  const asset=assets.find(x=>x.id===a.assetId);if(!asset)throw new StudioError('E_ASSET_NOT_FOUND',404);
  if(name==='asset_inspect')return asset;
  const sha=asset.metadata?.sha256;if(!/^[a-f0-9]{64}$/.test(sha||''))throw new StudioError('E_ASSET_NOT_UPLOADED',404);
  const {data:row,error}=await this.db.from('studio_assets').select('*').eq('project_id',p.id).eq('sha256',sha).single();dbError(error);
  const {data,error:err}=await this.db.storage.from('studio-assets').download(row.path);dbError(err);
  const bytes=new Uint8Array(await data.arrayBuffer());if(digest(Buffer.from(bytes))!==sha)throw new StudioError('E_ASSET_HASH',409);
  return {sha256:sha,valid:true,...inspectBytes(bytes,row.mime)};
 }
}
function actionFor(name){return ({project_save:'save',scene_dispatch:'dispatch',scene_undo:'undo',scene_redo:'redo',project_restore:'restore',motion_import:'motion',motion_retarget:'motion'})[name];}
export function inspectBytes(bytes,mime){
 if(bytes.length>3145728)throw new StudioError('E_CLOUD_ASSET_3MB_LIMIT',413);
 if(mime==='model/gltf-binary')return validateRenderGlb(bytes);
 if(mime!=='image/png')throw new StudioError('E_FILE_TYPE');return validatePng(bytes);
}
