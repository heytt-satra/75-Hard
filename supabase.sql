create table if not exists public.daily_logs (
  id uuid primary key,
  log_date date not null unique,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.revenue_entries (
  id uuid primary key,
  entry_date date not null,
  source text not null,
  type text not null,
  amount numeric not null default 0,
  status text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.restart_events (
  id uuid primary key,
  restart_date date not null,
  reason text not null,
  failed_task text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.business_pipeline (
  id uuid primary key,
  area text not null,
  stage text not null,
  value numeric not null default 0,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.device_status (
  id text primary key,
  name text not null,
  sync_state text not null,
  last_seen_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', true)
on conflict (id) do nothing;

alter table public.daily_logs enable row level security;
alter table public.revenue_entries enable row level security;
alter table public.restart_events enable row level security;
alter table public.business_pipeline enable row level security;
alter table public.device_status enable row level security;

create policy "personal anon daily logs"
on public.daily_logs
for all
to anon
using (true)
with check (true);

create policy "personal anon revenue entries"
on public.revenue_entries
for all
to anon
using (true)
with check (true);

create policy "personal anon restart events"
on public.restart_events
for all
to anon
using (true)
with check (true);

create policy "personal anon business pipeline"
on public.business_pipeline
for all
to anon
using (true)
with check (true);

create policy "personal anon device status"
on public.device_status
for all
to anon
using (true)
with check (true);

create policy "personal anon progress photos"
on storage.objects
for all
to anon
using (bucket_id = 'progress-photos')
with check (bucket_id = 'progress-photos');

do $$
begin
  alter publication supabase_realtime add table public.daily_logs;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.revenue_entries;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.restart_events;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.business_pipeline;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.device_status;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
