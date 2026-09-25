create table if not exists public.game_rooms (
  id text primary key check (id ~ '^[A-F0-9]{6}$'),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists game_rooms_owner_idx on public.game_rooms(owner_user_id);
create index if not exists game_rooms_updated_idx on public.game_rooms(updated_at);

alter table public.game_rooms enable row level security;
revoke all on public.game_rooms from anon, authenticated;
grant all on public.game_rooms to service_role;
