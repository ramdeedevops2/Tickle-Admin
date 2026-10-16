-- Run once in Supabase SQL Editor before deploying the Child Safety admin tab.
-- Restricted case records and evidence are never readable by app members.
begin;

create table if not exists public.child_safety_cases (
  id uuid primary key default gen_random_uuid(),
  report_id uuid unique references public.reports(id) on delete set null,
  target_user_id uuid,
  status text not null default 'open' check (status in ('open','reviewing','confirmed','dismissed','closed')),
  assigned_to uuid,
  evidence_reference text,
  containment_note text,
  authority text,
  authority_reference text,
  authority_reported_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.child_safety_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.child_safety_cases(id),
  actor_id uuid not null,
  action text not null,
  note text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists child_safety_events_case on public.child_safety_events(case_id,created_at);
create table if not exists public.moderation_evidence (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null unique,
  owner_id uuid not null,
  kind text not null,
  snapshot jsonb not null,
  source_bucket text,
  source_path text,
  quarantine_path text,
  preserved_at timestamptz,
  removed_at timestamptz,
  actor_id uuid not null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.child_safety_cases enable row level security;
alter table public.child_safety_events enable row level security;
alter table public.moderation_evidence enable row level security;
revoke all on public.child_safety_cases, public.child_safety_events, public.moderation_evidence from public, anon, authenticated;
grant all on public.child_safety_cases, public.child_safety_events, public.moderation_evidence to service_role;

insert into storage.buckets(id,name,public)
values ('moderation-evidence','moderation-evidence',false)
on conflict(id) do update set public=false;
-- No client policies or signed/public evidence URLs are created.
drop policy if exists moderation_evidence_restricted on storage.objects;
create policy moderation_evidence_restricted on storage.objects as restrictive
for all to anon,authenticated
using (bucket_id <> 'moderation-evidence')
with check (bucket_id <> 'moderation-evidence');

insert into public.report_reasons(key,label,hint,severity,urgent,sort_order,active)
values ('child_safety','Child safety or exploitation','Concerns about a child being abused, groomed or sexually exploited.',3,true,5,true)
on conflict(key) do update set label=excluded.label,hint=excluded.hint,severity=3,urgent=true,active=true;

create or replace function public.child_safety_action(
  p_actor uuid, p_action text, p_case uuid default null, p_version int default null,
  p_report uuid default null, p_note text default '', p_details jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare c child_safety_cases%rowtype; r reports%rowtype; v_id uuid;
begin
  if not exists(select 1 from admin_profiles where id=p_actor and role='admin') then
    raise exception 'Admin required';
  end if;
  if length(trim(p_note)) < 3 then raise exception 'A written reason is required'; end if;
  if p_action='create' then
    select * into r from reports where id=p_report;
    if not found then raise exception 'Report not found'; end if;
    insert into child_safety_cases(report_id,target_user_id,assigned_to)
    values(r.id,r.reported_user_id,p_actor) returning id into v_id;
  else
    select * into c from child_safety_cases where id=p_case for update;
    if not found then raise exception 'Case not found'; end if;
    if p_version is null or c.version<>p_version then raise exception 'Case changed. Refresh before saving.'; end if;
    if c.status in ('closed','dismissed') then raise exception 'This case is closed'; end if;
    v_id:=c.id;
    if p_action='review' then
      update child_safety_cases set status='reviewing',assigned_to=p_actor where id=v_id;
    elsif p_action='evidence' then
      if length(trim(coalesce(p_details->>'reference',''))) < 3 then raise exception 'Evidence reference required'; end if;
      update child_safety_cases set evidence_reference=p_details->>'reference' where id=v_id;
    elsif p_action='containment' then
      if length(trim(coalesce(p_details->>'reference',''))) < 3 then raise exception 'Containment action reference required'; end if;
      update child_safety_cases set containment_note=p_details->>'reference' where id=v_id;
    elsif p_action='confirm' then
      if c.status<>'reviewing' then raise exception 'Review the case before confirming'; end if;
      if c.evidence_reference is null then raise exception 'Record the evidence reference first'; end if;
      update child_safety_cases set status='confirmed' where id=v_id;
    elsif p_action='authority' then
      if c.status<>'confirmed' then raise exception 'Confirm the case before recording an authority report'; end if;
      if length(trim(coalesce(p_details->>'authority',''))) < 3
        or length(trim(coalesce(p_details->>'reference',''))) < 3
        or nullif(p_details->>'reported_at','') is null then raise exception 'Authority, receipt reference and submission time required'; end if;
      if (p_details->>'reported_at')::timestamptz > now() then raise exception 'Submission time cannot be in the future'; end if;
      update child_safety_cases set authority=p_details->>'authority',authority_reference=p_details->>'reference',
        authority_reported_at=(p_details->>'reported_at')::timestamptz where id=v_id;
    elsif p_action='close' then
      if c.status<>'confirmed' or c.authority_reference is null or c.containment_note is null
        or c.evidence_reference is null then raise exception 'Confirmed cases need evidence, containment and an authority submission record before closure'; end if;
      update child_safety_cases set status='closed' where id=v_id;
    elsif p_action='dismiss' then
      if c.status='confirmed' then raise exception 'A confirmed case cannot be dismissed'; end if;
      update child_safety_cases set status='dismissed' where id=v_id;
    elsif p_action<>'note' then raise exception 'Unknown action';
    end if;
    update child_safety_cases set updated_at=now(),version=version+1 where id=v_id;
  end if;
  insert into child_safety_events(case_id,actor_id,action,note,details)
  values(v_id,p_actor,p_action,p_note,p_details);
  return v_id;
end; $$;
revoke all on function public.child_safety_action(uuid,text,uuid,int,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.child_safety_action(uuid,text,uuid,int,uuid,text,jsonb) to service_role;

-- Complete removal only after the server has preserved the restricted object.
create or replace function public.finish_content_removal(p_flag uuid,p_actor uuid)
returns void language plpgsql security definer set search_path=public as $$
declare f content_flags%rowtype; e moderation_evidence%rowtype;
begin
  select * into f from content_flags where id=p_flag for update;
  if not found then raise exception 'Flag not found'; end if;
  select * into e from moderation_evidence where flag_id=p_flag for update;
  if not found or e.preserved_at is null then raise exception 'Preserve evidence before removal'; end if;
  if e.removed_at is not null then return; end if;
  if e.source_bucket is not null then
    if not exists(select 1 from storage.objects where bucket_id='moderation-evidence' and name=e.quarantine_path)
      or exists(select 1 from storage.objects where bucket_id=e.source_bucket and name=e.source_path) then
      raise exception 'Private evidence copy and original object removal must be verified first';
    end if;
  end if;
  if f.kind='photo' then
    update profiles set photos=array_remove(photos,f.target_path) where user_id=f.owner_id;
  elsif f.kind='video' then
    update profiles set profile_video=null where user_id=f.owner_id and profile_video=f.target_path;
  elsif f.kind='voice' then
    update profiles set voice_prompts=coalesce((select jsonb_agg(v) from jsonb_array_elements(coalesce(voice_prompts,'[]'::jsonb)) v
      where v->>'path' is distinct from f.target_path),'[]'::jsonb) where user_id=f.owner_id;
  elsif f.kind='daily' then
    delete from dailies where id=f.target_id and user_id=f.owner_id;
  elsif f.kind='bio' then
    update profiles set bio=null where user_id=f.owner_id and bio is not distinct from (e.snapshot->>'bio');
  else
    raise exception 'Unsupported content type: review and contain this item manually';
  end if;
  update content_flags set status='removed',reviewed_by=p_actor,reviewed_at=now() where id=p_flag;
  update moderation_evidence set removed_at=now() where flag_id=p_flag;
end; $$;
revoke all on function public.finish_content_removal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finish_content_removal(uuid,uuid) to service_role;
commit;
