begin;
-- Synthetic identities and sessions only; all rows are rolled back at the end.
insert into auth.users(id,aud,role) values('11111111-1111-4111-8111-111111111111','authenticated','authenticated'),('22222222-2222-4222-8222-222222222222','authenticated','authenticated');
insert into auth.sessions(id,user_id,created_at,updated_at) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',now(),now()),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',now(),now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
do $$declare w jsonb:='{"schemaVersion":"0.1.0","worldId":"qa","name":"QA","coordinateSystem":{"handedness":"right","upAxis":"Y","unit":"meter"},"assets":[],"entities":[]}';r jsonb;begin
 r:=public.studio_save('33333333-3333-4333-8333-333333333333','QA',w,'[]',0,'44444444-4444-4444-8444-444444444444',repeat('a',64),'create');
 if (r->>'version')::int<>1 then raise exception 'QA_CREATE';end if;
 r:=public.studio_save('33333333-3333-4333-8333-333333333333','QA',w,'[]',0,'44444444-4444-4444-8444-444444444444',repeat('a',64),'create');
 if not (r->>'replayed')::boolean then raise exception 'QA_IDEMPOTENCY';end if;
 begin perform public.studio_save('33333333-3333-4333-8333-333333333333','QA',w,'[]',0,gen_random_uuid(),repeat('b',64),'save');raise exception 'QA_CONFLICT_NOT_REJECTED';exception when serialization_failure then null;end;
 begin update public.studio_projects set owner_id='22222222-2222-4222-8222-222222222222';raise exception 'QA_RAW_WRITE_NOT_REJECTED';exception when insufficient_privilege then null;end;
 r:=public.studio_save('33333333-3333-4333-8333-333333333333','QA',jsonb_set(w,'{name}','"changed"'),'[]',1,gen_random_uuid(),repeat('b',64),'save');
 r:=public.studio_save('33333333-3333-4333-8333-333333333333','QA',w,'[]',2,gen_random_uuid(),repeat('c',64),'undo');
 if (select world->>'name' from public.studio_projects where id='33333333-3333-4333-8333-333333333333')<>'QA' then raise exception 'QA_UNDO';end if;
 r:=public.studio_save('33333333-3333-4333-8333-333333333333','QA',w,'[]',3,gen_random_uuid(),repeat('d',64),'redo');
 if (select world->>'name' from public.studio_projects where id='33333333-3333-4333-8333-333333333333')<>'changed' then raise exception 'QA_REDO';end if;
 if (select count(*) from public.studio_revisions where project_id='33333333-3333-4333-8333-333333333333')<>4 then raise exception 'QA_HISTORY';end if;
end$$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}',true);
do $$begin
 if exists(select 1 from public.studio_projects where id='33333333-3333-4333-8333-333333333333') then raise exception 'QA_RLS_LEAK';end if;
 if exists(select 1 from public.studio_revisions where project_id='33333333-3333-4333-8333-333333333333') then raise exception 'QA_HISTORY_LEAK';end if;
 begin perform public.studio_save('33333333-3333-4333-8333-333333333333','QA','{"entities":[],"assets":[]}','[]',4,gen_random_uuid(),repeat('f',64),'save');raise exception 'QA_CROSS_USER_WRITE';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","client_id":"qa","aud":"wrong","scope":"studio:read studio:write"}',true);
do $$begin if exists(select 1 from public.studio_projects where id='33333333-3333-4333-8333-333333333333') then raise exception 'QA_AUDIENCE_LEAK';end if;end$$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","client_id":"qa","aud":"https://aldol-3d-studio.vercel.app/mcp","scope":"studio:read"}',true);
do $$begin
 if not exists(select 1 from public.studio_projects where id='33333333-3333-4333-8333-333333333333') then raise exception 'QA_READ';end if;
 begin perform public.studio_save('33333333-3333-4333-8333-333333333333','QA','{"entities":[],"assets":[]}','[]',4,gen_random_uuid(),repeat('f',64),'save');raise exception 'QA_SCOPE_WRITE';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}',true);
do $$begin if exists(select 1 from public.studio_projects where id='33333333-3333-4333-8333-333333333333') then raise exception 'QA_REVOKED_SESSION';end if;end$$;
reset role;
rollback;
select 'PASS: real Postgres RLS two users, ownership, raw-write denial, idempotency, CAS conflict, history, undo/redo, audience, read-scope, revoked session; all fixtures rolled back' as result;
