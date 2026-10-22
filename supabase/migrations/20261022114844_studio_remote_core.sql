-- Additive, isolated Studio objects. Never changes existing application tables.
create schema if not exists studio_private;
revoke all on schema studio_private from public, anon;
grant usage on schema studio_private to authenticated;
create table public.studio_projects (
 id uuid primary key, owner_id uuid not null references auth.users(id),
 name text not null check(length(name) between 1 and 100),
 world jsonb not null, motions jsonb not null default '[]',
 version bigint not null default 1, undo_versions bigint[] not null default '{}', redo_versions bigint[] not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(octet_length(world::text)<=2097152), check(octet_length(motions::text)<=2097152)
);
create table public.studio_revisions (
 project_id uuid not null references public.studio_projects(id), version bigint not null,
 owner_id uuid not null references auth.users(id), world jsonb not null, motions jsonb not null,
 request_id uuid not null, request_hash text not null, action text not null,
 created_at timestamptz not null default now(), primary key(project_id,version),unique(owner_id,request_id)
);
create table public.studio_assets (
 project_id uuid not null references public.studio_projects(id), owner_id uuid not null references auth.users(id),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), path text not null unique,
 byte_size bigint not null check(byte_size between 1 and 3145728), mime text not null check(mime in ('model/gltf-binary','image/png')),
 created_at timestamptz not null default now(), primary key(project_id,sha256)
);
create table public.studio_activity_logs (
 id bigint generated always as identity primary key, owner_id uuid not null, project_id uuid not null,
 action text not null, version bigint not null, created_at timestamptz not null default now()
);
-- A live session is required, including after token signature validation.
create function studio_private.allowed(writing boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
 and exists(select 1 from auth.sessions s where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid())
 and (auth.jwt()->>'client_id' is null or (
   (auth.jwt()->'aud' ? 'https://aldol-3d-studio.vercel.app/mcp' or auth.jwt()->>'aud'='https://aldol-3d-studio.vercel.app/mcp')
   and (string_to_array(auth.jwt()->>'scope',' ') @> array[case when writing then 'studio:write' else 'studio:read' end])
 ));
$$;
revoke all on function studio_private.allowed(boolean) from public,anon;
grant execute on function studio_private.allowed(boolean) to authenticated;
alter table public.studio_projects enable row level security;
alter table public.studio_revisions enable row level security;
alter table public.studio_assets enable row level security;
alter table public.studio_activity_logs enable row level security;
create policy studio_projects_read on public.studio_projects for select to authenticated using(owner_id=(select auth.uid()) and studio_private.allowed());
create policy studio_revisions_read on public.studio_revisions for select to authenticated using(owner_id=(select auth.uid()) and studio_private.allowed());
create policy studio_assets_read on public.studio_assets for select to authenticated using(owner_id=(select auth.uid()) and studio_private.allowed());
create policy studio_logs_read on public.studio_activity_logs for select to authenticated using(owner_id=(select auth.uid()) and studio_private.allowed());
revoke all on public.studio_projects,public.studio_revisions,public.studio_assets,public.studio_activity_logs from anon,authenticated;
grant select on public.studio_projects,public.studio_revisions,public.studio_assets,public.studio_activity_logs to authenticated;
create index studio_projects_owner on public.studio_projects(owner_id);
create index studio_revisions_owner on public.studio_revisions(owner_id);
create index studio_assets_owner on public.studio_assets(owner_id);
create index studio_logs_owner on public.studio_activity_logs(owner_id);
-- All writes are atomic, owner-checked, bounded and compare-and-swap.
-- Definer is private; caller-supplied owner IDs are never accepted.
create function studio_private.save(p_id uuid,p_name text,p_world jsonb,p_motions jsonb,p_expected bigint,p_request uuid,p_hash text,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.studio_projects; receipt public.studio_revisions; next_version bigint; undo_stack bigint[]:='{}'; redo_stack bigint[]:='{}'; target_version bigint; owner uuid:=auth.uid();
begin
 if not studio_private.allowed(true) then raise exception 'E_FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 select * into receipt from public.studio_revisions where owner_id=owner and request_id=p_request;
 if found then
  if receipt.project_id<>p_id or receipt.request_hash<>p_hash then raise exception 'E_REQUEST_ID_REUSE';end if;
  return jsonb_build_object('id',p_id,'version',receipt.version,'replayed',true);
 end if;
 if p_action not in ('create','save','dispatch','undo','redo','motion','restore') or p_hash !~ '^[a-f0-9]{64}$'
 or jsonb_typeof(p_world)<>'object' or jsonb_typeof(p_world->'entities')<>'array'
 or jsonb_typeof(p_world->'assets')<>'array' or jsonb_typeof(p_motions)<>'array'
 or octet_length(p_world::text)>2097152 or octet_length(p_motions::text)>2097152
 or length(p_name) not between 1 and 100 then raise exception 'E_DOCUMENT_INVALID';end if;
 select * into old from public.studio_projects where id=p_id for update;
 if found then
  if old.owner_id<>owner then raise exception 'E_NOT_FOUND' using errcode='42501';end if;
  if old.version<>p_expected then raise exception 'E_VERSION_CONFLICT' using errcode='40001';end if;
  next_version:=old.version+1;
  undo_stack:=old.undo_versions;redo_stack:=old.redo_versions;
  if p_action='undo' then
    target_version:=undo_stack[array_length(undo_stack,1)];
    if target_version is null then raise exception 'E_UNDO_EMPTY';end if;
    undo_stack:=undo_stack[1:array_length(undo_stack,1)-1];redo_stack:=array_append(redo_stack,old.version);
  elsif p_action='redo' then
    target_version:=redo_stack[array_length(redo_stack,1)];
    if target_version is null then raise exception 'E_REDO_EMPTY';end if;
    redo_stack:=redo_stack[1:array_length(redo_stack,1)-1];undo_stack:=array_append(undo_stack,old.version);
  else
    undo_stack:=array_append(undo_stack,old.version);redo_stack:='{}';
  end if;
  if target_version is not null then
    select world,motions into p_world,p_motions from public.studio_revisions where project_id=p_id and version=target_version;
    if not found then raise exception 'E_HISTORY_MISSING';end if;
  end if;
 else
  if p_expected<>0 then raise exception 'E_NOT_FOUND';end if;
  if (select count(*) from public.studio_projects where owner_id=owner)>=50 then raise exception 'E_PROJECT_QUOTA';end if;
  next_version:=1;
 end if;
 if (select coalesce(sum(octet_length(world::text)+octet_length(motions::text)),0) from public.studio_revisions where owner_id=owner)+octet_length(p_world::text)+octet_length(p_motions::text)>83886080 then raise exception 'E_HISTORY_QUOTA_BACKUP_REQUIRED';end if;
 insert into public.studio_projects(id,owner_id,name,world,motions,version,undo_versions,redo_versions) values(p_id,owner,p_name,p_world,p_motions,next_version,undo_stack,redo_stack)
 on conflict(id) do update set name=excluded.name,world=excluded.world,motions=excluded.motions,version=excluded.version,undo_versions=excluded.undo_versions,redo_versions=excluded.redo_versions,updated_at=now();
 insert into public.studio_revisions(project_id,version,owner_id,world,motions,request_id,request_hash,action)
 values(p_id,next_version,owner,p_world,p_motions,p_request,p_hash,p_action);
 insert into public.studio_activity_logs(owner_id,project_id,action,version) values(owner,p_id,p_action,next_version);
 return jsonb_build_object('id',p_id,'version',next_version,'replayed',false);
end;$$;
revoke all on function studio_private.save(uuid,text,jsonb,jsonb,bigint,uuid,text,text) from public,anon;
grant execute on function studio_private.save(uuid,text,jsonb,jsonb,bigint,uuid,text,text) to authenticated;
create function public.studio_save(p_id uuid,p_name text,p_world jsonb,p_motions jsonb,p_expected bigint,p_request uuid,p_hash text,p_action text)
returns jsonb language sql security invoker set search_path='' as $$select studio_private.save(p_id,p_name,p_world,p_motions,p_expected,p_request,p_hash,p_action);$$;
revoke all on function public.studio_save(uuid,text,jsonb,jsonb,bigint,uuid,text,text) from public,anon;
grant execute on function public.studio_save(uuid,text,jsonb,jsonb,bigint,uuid,text,text) to authenticated;
create function studio_private.reserve_asset(p_project uuid,p_sha text,p_size bigint,p_mime text) returns text
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); result text;
begin
 if not studio_private.allowed(true) then raise exception 'E_FORBIDDEN' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 if not exists(select 1 from public.studio_projects where id=p_project and owner_id=owner) then raise exception 'E_NOT_FOUND';end if;
 select path into result from public.studio_assets where project_id=p_project and sha256=p_sha;
 if found then return result;end if;
 if (select count(*)*3145728 from public.studio_assets where owner_id=owner)+3145728>83886080 then raise exception 'E_ASSET_QUOTA';end if;
 result:=owner::text||'/'||p_project::text||'/'||p_sha||case when p_mime='image/png' then '.png' else '.glb' end;
 insert into public.studio_assets values(p_project,owner,p_sha,result,p_size,p_mime,now());
 return result;
end;$$;
revoke all on function studio_private.reserve_asset(uuid,text,bigint,text) from public,anon;
grant execute on function studio_private.reserve_asset(uuid,text,bigint,text) to authenticated;
create function public.studio_reserve_asset(p_project uuid,p_sha text,p_size bigint,p_mime text) returns text
language sql security invoker set search_path='' as $$select studio_private.reserve_asset(p_project,p_sha,p_size,p_mime);$$;
revoke all on function public.studio_reserve_asset(uuid,text,bigint,text) from public,anon;
grant execute on function public.studio_reserve_asset(uuid,text,bigint,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('studio-assets','studio-assets',false,3145728,array['model/gltf-binary','image/png']);
create policy studio_storage_read on storage.objects for select to authenticated using(bucket_id='studio-assets' and exists(select 1 from public.studio_assets a where a.path=name and a.owner_id=(select auth.uid())));
create policy studio_storage_insert on storage.objects for insert to authenticated with check(bucket_id='studio-assets' and studio_private.allowed(true) and exists(select 1 from public.studio_assets a where a.path=name and a.owner_id=(select auth.uid())));
