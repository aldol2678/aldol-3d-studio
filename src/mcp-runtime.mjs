import {createLegacyPort} from './bootstrap.mjs';
import {MotionLibrary} from './motion-library.mjs';

// Shared command contract for local stdio and loopback-only HTTP.
// The HTTP transport intentionally exposes read-only tools.
export async function createStudioMcpRuntime({editorDir,worldFile=null,allowWrite=false}={}){
  if(!editorDir)throw Error('E_LEGACY_SOURCE_REQUIRED');
  const port=await createLegacyPort(editorDir,worldFile);
  const motions=new MotionLibrary();
const readOnly=[
  {name:'scene_read',description:'Read scene nodes, revision token and capabilities.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'scene_validate',description:'Validate current scene against the unchanged INHA WORLD schema.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'scene_export_world',description:'Export canonical world.json as an in-memory string (does not write to disk).',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'motion_library',description:'List bounded session-local animation clips and their SHA-256 metadata; does not inspect filesystem.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'motion_validate',description:'Validate a JSON keyframe clip (or imported clip id). Does not add the clip.',inputSchema:{type:'object',properties:{clip:{type:'object'},id:{type:'string'}},additionalProperties:false}},
  {name:'motion_blend',description:'Read-only interpolated pose blend for two matching-skeleton clips. Does not animate the Studio viewport.',inputSchema:{type:'object',properties:{aId:{type:'string'},bId:{type:'string'},time:{type:'number',minimum:0},alpha:{type:'number',minimum:0,maximum:1}},required:['aId','bId','time','alpha'],additionalProperties:false}},
  {name:'motion_export',description:'Return ALDOL motion JSON data with hash, never GLB/FBX or filesystem bytes.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}},
];
const mutating=[
  {name:'motion_import',description:'Add a validated ALDOL JSON motion clip to this session. Requires --allow-write.',inputSchema:{type:'object',properties:{clip:{type:'object'}},required:['clip'],additionalProperties:false}},
  {name:'motion_retarget',description:'Create a name-remapped copy of a motion clip; no IK, bone-length compensation, or GLB support. Requires --allow-write.',inputSchema:{type:'object',properties:{sourceId:{type:'string'},id:{type:'string'},name:{type:'string'},targetSkeleton:{type:'array',items:{type:'string'}},mapping:{type:'object',additionalProperties:{type:'string'}}},required:['sourceId','id','targetSkeleton'],additionalProperties:false}},
  {name:'scene_dispatch',description:'Apply strict typed scene command in local session. Requires explicit --allow-write.',inputSchema:{type:'object',properties:{command:{type:'object'}},required:['command'],additionalProperties:false}},
  {name:'scene_undo',description:'Undo local session command with revision check.',inputSchema:{type:'object',properties:{expectedRevision:{type:'string'}},required:['expectedRevision'],additionalProperties:false}},
  {name:'scene_redo',description:'Redo local session command with revision check.',inputSchema:{type:'object',properties:{expectedRevision:{type:'string'}},required:['expectedRevision'],additionalProperties:false}}
];
const registry = [...readOnly,...(allowWrite?mutating:[])];
const asToolResponse = (data,isError=false)=>({content:[{type:'text',text:typeof data==='string'?data:JSON.stringify(data)}],...(isError?{isError:true}:{})});
async function handle(request){
  if(request.jsonrpc!=='2.0' || typeof request.method!=='string') throw {code:-32600,message:'Invalid JSON-RPC request'};
  const args=request.params??{};
  switch(request.method){
    case 'initialize': return {protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'aldol-3d-studio-local',version:'0.5.0-motion-dev'}};
    case 'ping': return {};
    case 'tools/list': return {tools:registry};
    case 'tools/call': {
      const name=args.name, input=args.arguments??{};
      if(!registry.some(x=>x.name===name))throw {code:-32602,message:'Unknown or disabled tool'};
      try {
        if(name==='motion_library')return asToolResponse(motions.library());
        if(name==='motion_validate')return asToolResponse(motions.validate(input));
        if(name==='motion_blend')return asToolResponse(motions.blend(input));
        if(name==='motion_export')return asToolResponse(motions.export(input.id));
        if(name==='motion_import')return asToolResponse(motions.import(input.clip));
        if(name==='motion_retarget')return asToolResponse(motions.retarget(input));
        if(name==='scene_read')return asToolResponse(port.read());
        if(name==='scene_validate')return asToolResponse(port.validate());
        if(name==='scene_export_world')return asToolResponse(port.exportWorld());
        if(name==='scene_dispatch'){if(!input.command)throw new Error('E_COMMAND_REQUIRED');const x=await port.dispatch(input.command);return asToolResponse(x,x.status==='rejected'||x.status==='conflict');}
        if(name==='scene_undo'||name==='scene_redo'){
          if(typeof input.expectedRevision!=='string')throw new Error('E_REVISION_REQUIRED');
          const x=await port[name==='scene_undo'?'undo':'redo'](input.expectedRevision);
          return asToolResponse(x,x.status==='rejected'||x.status==='conflict');
        }
      }catch(e){return asToolResponse({error:e.message},true);}
    }
    default: throw {code:-32601,message:'Method not found'};
  }
}

  return {handle,registry,allowWrite};
}
