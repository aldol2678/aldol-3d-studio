export function config(env=process.env){
 const origin=env.STUDIO_ORIGIN||'https://aldol-3d-studio.vercel.app';
 const supabaseUrl=env.STUDIO_SUPABASE_URL;
 const publishableKey=env.STUDIO_SUPABASE_PUBLISHABLE_KEY;
 return {origin,resource:origin+'/mcp',supabaseUrl,publishableKey,issuer:supabaseUrl+'/auth/v1',mcpEnabled:env.STUDIO_MCP_ENABLED==='true',writesEnabled:env.STUDIO_MCP_WRITES==='true'};
}
export class StudioError extends Error {constructor(code,status=400){super(code);this.status=status;}}
