import {safeKey,validateCommand} from './command-schema.mjs';
const clone=x=>structuredClone(x);
export function applySceneCommand(world,commands,validateWorld,c){
 const invalid=validateCommand(c);if(invalid)throw Error(invalid);
 const p=c.payload;let applied=false;
 const verifyCandidate=candidate=>{const w={...world.snapshot(),entities:world.listEntities().map(e=>e.id===candidate.id?candidate:e)};const v=validateWorld(w);if(!v.valid)throw Error(v.errors?.[0]?.code||'E_WORLD_INVALID');};
      if(c.operation==='node.create'){
        if(world.hasEntity(p.id))throw new Error('E_DUP_ENTITY_ID');
        if(p.parentId && !world.hasEntity(p.parentId))throw new Error('E_PARENT_NOT_FOUND');
        commands.addEntity(p);applied=true;
      } else if(c.operation==='node.rename'){
        const e=world.getEntity(c.targetId);if(!e)throw new Error('E_ENTITY_NOT_FOUND');
        if(e.name!==p.name.trim()){commands.renameEntity(c.targetId,p.name);applied=true;}
      } else if(c.operation==='node.transform'){
        const e=world.getEntity(c.targetId);if(!e)throw new Error('E_ENTITY_NOT_FOUND');
        const normalized=clone(p.transform);const len=Math.hypot(...normalized.rotation);normalized.rotation=normalized.rotation.map(n=>n/len);
        const next={...e,transform:normalized};verifyCandidate(next);
        if(safeKey(e.transform)!==safeKey(normalized)){commands.setTransform(c.targetId,normalized);applied=true;}
      } else if(c.operation==='node.duplicate'){
        if(!world.hasEntity(c.targetId))throw new Error('E_ENTITY_NOT_FOUND');
        commands.duplicateEntity(c.targetId);applied=true;
      } else if(c.operation==='node.delete'){
        if(!world.hasEntity(c.targetId))throw new Error('E_ENTITY_NOT_FOUND');
        if(world.listEntities().some(e=>e.parentId===c.targetId))throw new Error('E_ENTITY_HAS_CHILDREN');
        commands.removeEntity(c.targetId);applied=true;
      } else if(c.operation==='node.reparent'){
        const e=world.getEntity(c.targetId);if(!e)throw new Error('E_ENTITY_NOT_FOUND');
        const next={...e,parentId:p.parentId};verifyCandidate(next);
        if(e.parentId!==p.parentId){commands.replaceEntity(c.targetId,next,'Reparent Entity');applied=true;}
      }
 return applied;
}
