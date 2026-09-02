-- Phase 3：靶機心跳、即時可用狀態與單一玩家占用鎖。
-- 請在已執行 phase1_auth.sql 與 phase2_member_game.sql 後，於 Supabase SQL Editor 完整執行一次。

alter table public.lanes add column if not exists last_seen_at timestamptz;
alter table public.game_sessions add column if not exists lease_expires_at timestamptz;

-- id 是場次本身的主鍵，不應指向其他資料表；移除舊版誤建的外鍵。
alter table public.game_sessions drop constraint if exists game_sessions_id_fkey;

create index if not exists lanes_last_seen_at_idx on public.lanes (last_seen_at desc);
create index if not exists game_sessions_lane_lease_idx on public.game_sessions (target_id, status, lease_expires_at);

-- PostgreSQL 無法直接改變既有函式的 OUT 回傳欄位，因此先移除舊版函式再重建。
drop function if exists public.list_playable_lanes();

create or replace function public.list_playable_lanes()
returns table (id bigint, target_name text, address text, state boolean, last_seen_at timestamptz, availability text)
language sql security definer set search_path = public
as $$
  select l.id, l.target_name::text, l.address::text, l.state, l.last_seen_at,
    case
      when not l.state then 'disabled'
      when l.last_seen_at is null or l.last_seen_at < now() - interval '3 seconds' then 'offline'
      when exists (select 1 from public.game_sessions gs where gs.target_id = l.id and gs.status = 'playing' and coalesce(gs.lease_expires_at, gs.start_datetime + interval '20 minutes') > now()) then 'busy'
      else 'available'
    end::text
  from public.lanes l order by l.id;
$$;
revoke all on function public.list_playable_lanes() from public;
grant execute on function public.list_playable_lanes() to authenticated;

create or replace function public.start_my_game_session(p_lane_id bigint)
returns table (session_id bigint, lane_name text, started_at timestamptz)
language plpgsql security definer set search_path = public, auth
as $$
declare v_user_id bigint; v_lane_name text;
begin
  if auth.uid() is null then raise exception '請先登入後再開始遊玩。'; end if;
  select u.id into v_user_id from public.users u where u.auth_user_id = auth.uid() and u.state = 'active';
  if v_user_id is null then raise exception '目前帳號尚未啟用，無法開始遊玩。'; end if;
  perform pg_advisory_xact_lock(p_lane_id);
  select l.target_name::text into v_lane_name from public.lanes l where l.id = p_lane_id and l.state = true and l.last_seen_at >= now() - interval '3 seconds';
  if v_lane_name is null then raise exception '這台靶機目前離線或未開放，請選擇其他靶機。'; end if;
  update public.game_sessions set status = 'abandoned', end_datetime = now(), updated_at = now()
    where target_id = p_lane_id and status = 'playing' and coalesce(lease_expires_at, start_datetime + interval '20 minutes') <= now();
  if exists (select 1 from public.game_sessions gs where gs.target_id = p_lane_id and gs.status = 'playing' and coalesce(gs.lease_expires_at, gs.start_datetime + interval '20 minutes') > now()) then
    raise exception '這台靶機正在由其他玩家使用。';
  end if;
  return query insert into public.game_sessions (user_id, target_id, start_datetime, total_shots, total_score, status, updated_at, lease_expires_at)
    values (v_user_id, p_lane_id, now(), 0, 0, 'playing', now(), now() + interval '20 minutes')
    -- game_sessions.start_datetime 在既有資料表是 timestamp；函式宣告為 timestamptz，必須明確轉型。
    returning id::bigint, v_lane_name::text, start_datetime::timestamptz;
end;
$$;
revoke all on function public.start_my_game_session(bigint) from public;
grant execute on function public.start_my_game_session(bigint) to authenticated;

create or replace function public.record_my_game_shot(
  p_session_id bigint, p_shot_number smallint, p_score_final smallint, p_x_percent numeric, p_y_percent numeric,
  p_line_shot boolean default false, p_confidence text default 'HIGH', p_model_version text default 'V4.0'
)
returns table (shot_id bigint, total_shots integer, total_score integer)
language plpgsql security definer set search_path = public, auth
as $$
declare v_user_id bigint; v_shot_id bigint; v_total_shots integer; v_total_score integer;
begin
  if p_score_final not between 5 and 10 then raise exception '分數必須介於 5 到 10 分。'; end if;
  if p_x_percent not between 0 and 100 or p_y_percent not between 0 and 100 then raise exception '落點座標必須介於 0 到 100。'; end if;
  select u.id into v_user_id from public.users u where u.auth_user_id = auth.uid();
  if v_user_id is null then raise exception '請先登入。'; end if;
  if not exists (select 1 from public.game_sessions where id = p_session_id and user_id = v_user_id and status = 'playing' and coalesce(lease_expires_at, start_datetime + interval '20 minutes') > now()) then raise exception '此場次已結束或已逾時，請重新開始。'; end if;
  if p_shot_number not between 1 and 30 then raise exception '單場次最多 30 發。'; end if;
  if (select count(*) from public.shots where session_id = p_session_id) >= 30 then raise exception '本場次已達 30 發上限，請結束並保存成績。'; end if;
  insert into public.shots (session_id, shot_number, score_final, line_shot, confidence, model_version, x_percent, y_percent, created_at)
    values (p_session_id, p_shot_number, p_score_final, coalesce(p_line_shot, false), coalesce(p_confidence, 'HIGH'), coalesce(p_model_version, 'V4.0'), p_x_percent, p_y_percent, now()) returning id into v_shot_id;
  select count(*)::integer, coalesce(sum(score_final), 0)::integer into v_total_shots, v_total_score from public.shots where session_id = p_session_id;
  update public.game_sessions set total_shots = v_total_shots, total_score = v_total_score, updated_at = now(), lease_expires_at = now() + interval '20 minutes' where id = p_session_id;
  return query select v_shot_id, v_total_shots, v_total_score;
end;
$$;
revoke all on function public.record_my_game_shot(bigint, smallint, smallint, numeric, numeric, boolean, text, text) from public;
grant execute on function public.record_my_game_shot(bigint, smallint, smallint, numeric, numeric, boolean, text, text) to authenticated;

-- 玩家僅能讀取自己的最近三個月已完成場次。
drop function if exists public.list_my_game_history();
create or replace function public.list_my_game_history()
returns table (session_id bigint, lane_name text, started_at timestamptz, ended_at timestamptz, total_shots integer, total_score integer)
language sql security definer set search_path = public, auth
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
