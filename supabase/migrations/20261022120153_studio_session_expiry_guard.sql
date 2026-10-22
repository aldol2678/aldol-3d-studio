create or replace function studio_private.allowed(writing boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
 and exists(select 1 from auth.sessions s where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now()))
 and (auth.jwt()->>'client_id' is null or (
   (auth.jwt()->'aud' ? 'https://aldol-3d-studio.vercel.app/mcp' or auth.jwt()->>'aud'='https://aldol-3d-studio.vercel.app/mcp')
   and (string_to_array(auth.jwt()->>'scope',' ') @> array[case when writing then 'studio:write' else 'studio:read' end])
 ));
$$;
