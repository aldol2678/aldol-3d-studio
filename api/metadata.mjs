import {config} from '../server/config.mjs';
import {json} from '../server/http.mjs';
export default function(req,res){const c=config();if(!c.supabaseUrl)return json(res,503,{error:'E_CLOUD_NOT_CONFIGURED'});json(res,200,{resource:c.resource,authorization_servers:[c.issuer],scopes_supported:['studio:read',...(c.writesEnabled?['studio:write']:[])],bearer_methods_supported:['header'],resource_name:'ALDOL 3D Studio'});}
