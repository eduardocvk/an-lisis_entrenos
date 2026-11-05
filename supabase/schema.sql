-- Ejecutar una vez en el SQL Editor de TU proyecto Supabase.
-- No contiene claves. No crea ni modifica usuarios de autenticación.
create table if not exists public.activities (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (id ~ '^run-[0-9]{14}$'),
  summary jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint valid_activity_summary check (
    jsonb_typeof(summary) = 'object'
    and summary ?& array['distance','duration','start','name','sport']
    and jsonb_typeof(summary->'distance') = 'number'
    and jsonb_typeof(summary->'duration') = 'number'
    and summary->>'sport' in ('running','trail','trailRunning','treadmill')
    and (summary->>'distance')::numeric > 0
    and (summary->>'duration')::numeric > 0
    and (summary->>'rpe' is null or (summary->>'rpe')::numeric between 1 and 10)
  )
);
create table if not exists public.daily_health (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  sleep_hours numeric check (sleep_hours between 0 and 24),
  hrv numeric check (hrv > 0),
  resting_hr numeric check (resting_hr between 20 and 250),
  raw jsonb not null default '{}'::jsonb,
  primary key (user_id,day)
);
create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  finished_at timestamptz not null default now(),
  status text not null check (status in ('success','partial','error')),
  imported integer not null default 0,
  message text not null
);

alter table public.activities enable row level security;
alter table public.daily_health enable row level security;
alter table public.sync_runs enable row level security;
revoke all on public.activities,public.daily_health,public.sync_runs from anon;
grant select,insert,update,delete on public.activities to authenticated;
grant select on public.daily_health,public.sync_runs to authenticated;

create policy "activities_select_own" on public.activities for select to authenticated using ((select auth.uid())=user_id);
create policy "activities_insert_own" on public.activities for insert to authenticated with check ((select auth.uid())=user_id);
create policy "activities_update_own" on public.activities for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "activities_delete_own" on public.activities for delete to authenticated using ((select auth.uid())=user_id);
create policy "health_select_own" on public.daily_health for select to authenticated using ((select auth.uid())=user_id);
create policy "sync_select_own" on public.sync_runs for select to authenticated using ((select auth.uid())=user_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('activity-files','activity-files',false,62914560,array['application/json','application/octet-stream','application/zip'])
on conflict (id) do nothing;
create policy "files_select_own" on storage.objects for select to authenticated using (bucket_id='activity-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "files_insert_own" on storage.objects for insert to authenticated with check (bucket_id='activity-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "files_update_own" on storage.objects for update to authenticated using (bucket_id='activity-files' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='activity-files' and (storage.foldername(name))[1]=(select auth.uid())::text);

create function public.touch_activity() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at=now(); return new; end; $$;
create trigger activities_updated before update on public.activities for each row execute function public.touch_activity();

-- Update only diary fields, preserving metrics/metadata changed by another client.
create function public.save_activity_diary(p_id text,p_rpe integer,p_tags text,p_notes text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_rpe is not null and (p_rpe < 1 or p_rpe > 10) then
    raise exception 'RPE debe estar entre 1 y 10';
  end if;
  if length(p_tags) > 300 or length(p_notes) > 10000 then
    raise exception 'Texto del diario demasiado largo';
  end if;
  update public.activities
  set summary=summary || jsonb_build_object('rpe',p_rpe,'tags',coalesce(p_tags,''),'notes',coalesce(p_notes,''))
  where user_id=(select auth.uid()) and id=p_id;
  if not found then raise exception 'Actividad no encontrada o acceso denegado'; end if;
end; $$;
revoke all on function public.save_activity_diary(text,integer,text,text) from public,anon;
grant execute on function public.save_activity_diary(text,integer,text,text) to authenticated;
