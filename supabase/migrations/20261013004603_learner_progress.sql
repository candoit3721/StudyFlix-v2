-- StudyFlix learner progress and last visit, synced across a family's devices.
--
-- One shared family account (Supabase Auth, email and password, sign-up disabled) owns every row.
-- Row Level Security limits each signed-in user to their own rows; the anon role gets nothing.
-- See docs/supabase-sync.md for how the static site uses these tables.

-- ---------------------------------------------------------------- progress_events
-- Append-only: every answer (or imported local history) is one row. Devices never overwrite each
-- other, and retries are safe because (user_id, id) is the primary key and clients insert with
-- "on conflict do nothing".

create table public.progress_events (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  learner_id text not null,
  lesson_id text not null,
  kind text not null check (kind in ('item', 'practice')),
  key text not null,            -- '<blockId>:<promptHash>' for items, '<blockId>' for practice
  answered integer not null default 1 check (answered >= 1),
  correct integer not null check (correct >= 0 and correct <= answered),
  at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.progress_events enable row level security;

create policy "Family can read its progress events"
  on public.progress_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Family can add progress events"
  on public.progress_events for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- progress_summary
-- Per learner, lesson and progress key: the totals the site folds into its local cache.
-- security_invoker makes the view run with the caller's rights, so the RLS above applies.

create view public.progress_summary with (security_invoker = true) as
select learner_id, lesson_id, kind, key,
       sum(answered)::integer as answered,
       sum(correct)::integer as correct,
       max(at) as at
from public.progress_events
group by user_id, learner_id, lesson_id, kind, key;

-- ---------------------------------------------------------------- learner_visits
-- The last lesson each learner opened, one row per learner.

create table public.learner_visits (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  learner_id text not null,
  lesson_id text not null,
  visited_at timestamptz not null,
  primary key (user_id, learner_id)
);

alter table public.learner_visits enable row level security;

create policy "Family can read its visits"
  on public.learner_visits for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Family can add visits"
  on public.learner_visits for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Family can update its visits"
  on public.learner_visits for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- A device that flushes an old visit late must not move "last visit" backwards.
create function public.keep_newest_visit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visited_at <= old.visited_at then
    return null;
  end if;
  return new;
end;
$$;

create trigger keep_newest_visit
  before update on public.learner_visits
  for each row
  execute function public.keep_newest_visit();

-- Only the trigger calls it; keep it out of the API (PostgREST exposes callable public functions).
revoke execute on function public.keep_newest_visit() from public, anon, authenticated;

-- ---------------------------------------------------------------- grants
-- Supabase grants every privilege on new public tables to anon and authenticated by default.
-- Start from nothing and grant only what the site uses: events are never updated or deleted.

revoke all on public.progress_events from anon, authenticated;
revoke all on public.progress_summary from anon, authenticated;
revoke all on public.learner_visits from anon, authenticated;

grant select, insert on public.progress_events to authenticated;
grant select on public.progress_summary to authenticated;
grant select, insert, update on public.learner_visits to authenticated;
