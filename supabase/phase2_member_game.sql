-- 賈村戰技體驗場：會員專區與遊玩專區
-- 請在 phase1_auth.sql 成功執行後，再於 Supabase SQL Editor 執行本檔一次。

create extension if not exists pgcrypto;

-- 六個靶機。state = true 代表目前可由遊客選擇。
create unique index if not exists lanes_target_name_unique_ci
  on public.lanes (lower(target_name));

insert into public.lanes (target_name, address, state)
values
  ('靶機 1', 'esp32-01', true),
  ('靶機 2', 'esp32-02', true),
  ('靶機 3', 'esp32-03', false),
  ('靶機 4', 'esp32-04', false),
  ('靶機 5', 'esp32-05', false),
  ('靶機 6', 'esp32-06', false)
on conflict (lower(target_name)) do update
  set address = excluded.address;

alter table public.game_sessions
  add column if not exists status text not null default 'playing',
  add column if not exists updated_at timestamptz not null default now();

-- id 是場次本身的主鍵，不應指向其他資料表；移除舊版誤建的外鍵。
alter table public.game_sessions drop constraint if exists game_sessions_id_fkey;

alter table public.shots
  add column if not exists x_percent numeric(6,3),
  add column if not exists y_percent numeric(6,3),
  add column if not exists created_at timestamptz not null default now();

create index if not exists game_sessions_user_started_idx
  on public.game_sessions (user_id, start_datetime desc);
create index if not exists shots_session_number_idx
  on public.shots (session_id, shot_number);

-- 會員資料：帳號僅讀取；手機與暱稱可更新。
create or replace function public.get_my_profile()
returns table (
  id bigint,
  account text,
  name text,
  phone text,
  nick_name text,
  role_name text,
  state text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.id,
    u.email::text as account,
    u.name::text,
    u.phone::text,
    u.nick_name::text,
    r.role::text as role_name,
    u.state::text
  from public.users u
  left join public.roles r on r.id = u.roles_id
  where u.auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.update_my_profile(
  p_phone text,
  p_nick_name text
)
returns table (
  id bigint,
  account text,
  name text,
  phone text,
  nick_name text,
  role_name text,
  state text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception '尚未登入。';
  end if;
  if nullif(trim(coalesce(p_phone, '')), '') is null then
    raise exception '手機號碼不可空白。';
  end if;
  if nullif(trim(coalesce(p_nick_name, '')), '') is null then
    raise exception '暱稱不可空白。';
  end if;

  update public.users
  set phone = trim(p_phone),
      nick_name = trim(p_nick_name)
  where auth_user_id = auth.uid();

  return query
  select * from public.get_my_profile();
end;
$$;

revoke all on function public.update_my_profile(text, text) from public;
grant execute on function public.update_my_profile(text, text) to authenticated;

-- 前端讀取可用靶機；靶機啟用狀態將來可由管理端或 ESP 連線狀態調整。
create or replace function public.list_playable_lanes()
returns table (
  id bigint,
  target_name text,
  address text,
  state boolean
)
language sql
security definer
set search_path = public
as $$
  select l.id, l.target_name::text, l.address::text, l.state
  from public.lanes l
  order by l.id;
$$;

revoke all on function public.list_playable_lanes() from public;
grant execute on function public.list_playable_lanes() to authenticated;

create or replace function public.start_my_game_session(p_lane_id bigint)
returns table (
  session_id bigint,
  lane_name text,
  started_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id bigint;
  v_lane_name text;
begin
  if auth.uid() is null then
    raise exception '請先登入後再開始遊玩。';
  end if;

  select u.id into v_user_id
  from public.users u
  where u.auth_user_id = auth.uid() and u.state = 'active';
  if v_user_id is null then
    raise exception '帳號尚未啟用或不存在。';
  end if;

  select target_name::text into v_lane_name
  from public.lanes
  where id = p_lane_id and state = true;
  if v_lane_name is null then
    raise exception '此靶機目前不可使用，請選擇其他靶機。';
  end if;

  return query
  insert into public.game_sessions (
    user_id, target_id, start_datetime, total_shots, total_score, status, updated_at
  )
  values (v_user_id, p_lane_id, now(), 0, 0, 'playing', now())
  -- game_sessions.start_datetime 在既有資料表是 timestamp；函式宣告為 timestamptz，必須明確轉型。
  returning id::bigint, v_lane_name::text, start_datetime::timestamptz;
end;
$$;

revoke all on function public.start_my_game_session(bigint) from public;
grant execute on function public.start_my_game_session(bigint) to authenticated;

create or replace function public.record_my_game_shot(
  p_session_id bigint,
  p_shot_number smallint,
  p_score_final smallint,
  p_x_percent numeric,
  p_y_percent numeric,
  p_line_shot boolean default false,
  p_confidence text default 'HIGH',
  p_model_version text default 'V4.0'
)
returns table (
  shot_id bigint,
  total_shots integer,
  total_score integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id bigint;
  v_shot_id bigint;
  v_total_shots integer;
  v_total_score integer;
begin
  if p_score_final not between 5 and 10 then
    raise exception '分數必須介於 5 至 10。';
  end if;
  if p_x_percent not between 0 and 100 or p_y_percent not between 0 and 100 then
    raise exception '落點座標必須介於 0 至 100。';
  end if;

  select u.id into v_user_id from public.users u where u.auth_user_id = auth.uid();
  if v_user_id is null then
    raise exception '尚未登入。';
  end if;

  if not exists (
    select 1 from public.game_sessions
    where id = p_session_id and user_id = v_user_id and status = 'playing'
  ) then
    raise exception '找不到進行中的場次。';
  end if;
  if p_shot_number not between 1 and 30 then
    raise exception '單場次最多 30 發。';
  end if;
  if (select count(*) from public.shots where session_id = p_session_id) >= 30 then
    raise exception '本場次已達 30 發上限，請結束並保存成績。';
  end if;

  insert into public.shots (
    session_id, shot_number, score_final, line_shot, confidence, model_version,
    x_percent, y_percent, created_at
  )
  values (
    p_session_id, p_shot_number, p_score_final, coalesce(p_line_shot, false),
    coalesce(p_confidence, 'HIGH'), coalesce(p_model_version, 'V4.0'),
    p_x_percent, p_y_percent, now()
  )
  returning id into v_shot_id;

  select count(*)::integer, coalesce(sum(score_final), 0)::integer
  into v_total_shots, v_total_score
  from public.shots where session_id = p_session_id;

  update public.game_sessions
  set total_shots = v_total_shots,
      total_score = v_total_score,
      updated_at = now()
  where id = p_session_id;

  return query select v_shot_id, v_total_shots, v_total_score;
end;
$$;

revoke all on function public.record_my_game_shot(bigint, smallint, smallint, numeric, numeric, boolean, text, text) from public;
grant execute on function public.record_my_game_shot(bigint, smallint, smallint, numeric, numeric, boolean, text, text) to authenticated;

create or replace function public.finish_my_game_session(p_session_id bigint)
returns table (
  total_shots integer,
  total_score integer,
  ended_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id bigint;
begin
  select u.id into v_user_id from public.users u where u.auth_user_id = auth.uid();

  update public.game_sessions
  set status = 'finished',
      end_datetime = now(),
      updated_at = now()
  where id = p_session_id and user_id = v_user_id and status = 'playing';

  if not found then
    raise exception '找不到進行中的場次。';
  end if;

  return query
  select gs.total_shots::integer, gs.total_score::integer, gs.end_datetime
  from public.game_sessions gs
  where gs.id = p_session_id;
end;
$$;

revoke all on function public.finish_my_game_session(bigint) from public;
grant execute on function public.finish_my_game_session(bigint) to authenticated;

-- 玩家僅能讀取自己的最近三個月已完成場次。
drop function if exists public.list_my_game_history();
create or replace function public.list_my_game_history()
returns table (
  session_id bigint,
  lane_name text,
  started_at timestamptz,
  ended_at timestamptz,
  total_shots integer,
  total_score integer
)
language sql
security definer
set search_path = public, auth
as $$
  select gs.id::bigint, l.target_name::text, gs.start_datetime::timestamptz, gs.end_datetime::timestamptz,
    gs.total_shots::integer, gs.total_score::integer
  from public.game_sessions gs
  join public.users u on u.id = gs.user_id
  join public.lanes l on l.id = gs.target_id
  where u.auth_user_id = auth.uid()
    and gs.status = 'finished'
    and gs.start_datetime >= now() - interval '3 months'
  order by gs.start_datetime desc;
$$;
revoke all on function public.list_my_game_history() from public;
grant execute on function public.list_my_game_history() to authenticated;
