-- 每位真人的最近连接时间；仅 Edge Function 能读写。
create table if not exists public.game_presence (
  room_id text not null references public.game_rooms(id) on delete cascade,
  player_id text not null,
  client_id text,
  last_seen_at timestamptz not null,
  primary key (room_id, player_id)
);

alter table public.game_presence enable row level security;
revoke all on public.game_presence from anon, authenticated;
grant all on public.game_presence to service_role;
