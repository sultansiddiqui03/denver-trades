-- AI assistant conversation history = the assistant's cross-session memory.
-- One rolling thread per user (loaded recent-first as context each turn) so the
-- assistant remembers prior deals discussed, needs stated, and searches run.
create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_assistant_messages_user on public.assistant_messages (user_id, created_at);

alter table public.assistant_messages enable row level security;

drop policy if exists "Assistant messages by organization" on public.assistant_messages;
create policy "Assistant messages by organization" on public.assistant_messages
  for all
  using (org_id = app_private.current_org_id())
  with check (org_id = app_private.current_org_id());
