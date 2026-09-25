-- 游客房间没有 Auth 用户；房间仍由 Edge Function 的服务端密钥管理。
alter table public.game_rooms alter column owner_user_id drop not null;
