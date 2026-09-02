-- 賈村戰技體驗場：Supabase Auth + 隨機六位數 OTP
-- 請在 Supabase SQL Editor 執行一次。
-- 密碼、登入 Session 與驗證碼皆由 Supabase Auth 管理；
-- public.users 只保存遊客資料與 pending / active / disabled 狀態。

create extension if not exists pgcrypto;

alter table public.users
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;

create unique index if not exists users_auth_user_id_unique
  on public.users (auth_user_id)
  where auth_user_id is not null;
create unique index if not exists users_email_unique_ci
  on public.users (lower(email));

alter table public.users
  alter column state type text using case
    when state::text in ('true', 't', '1') then 'active'
    when state::text in ('false', 'f', '0') then 'pending'
    when state::text in ('pending', 'active', 'disabled') then state::text
    else 'pending'
  end;
alter table public.users alter column state set default 'pending';
alter table public.users alter column password drop not null;

-- Supabase Auth 的密碼雜湊不可讀取，因此註冊時由前端在建立 Auth 帳號後，
-- 立即呼叫本函式，把相同明文密碼以 bcrypt 雜湊存入既有 users.password。
-- 僅接受尚未驗證、且剛建立 15 分鐘內的帳號，避免用此 RPC 任意改寫舊帳號。
create or replace function public.store_pending_registration_password_hash(
  p_auth_user_id uuid,
  p_email text,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if p_password is null or length(p_password) < 8 then
    raise exception '密碼至少需要 8 碼。';
  end if;

  update public.users u
  set password = crypt(p_password, gen_salt('bf'))
  from auth.users au
  where u.auth_user_id = p_auth_user_id
    and au.id = p_auth_user_id
    and lower(u.email) = lower(trim(p_email))
    and u.state = 'pending'
    and au.email_confirmed_at is null
    and au.created_at >= now() - interval '15 minutes';

  if not found then
    raise exception '找不到可寫入密碼的待驗證帳號。';
  end if;

  return true;
end;
$$;

revoke all on function public.store_pending_registration_password_hash(uuid, text, text) from public;
grant execute on function public.store_pending_registration_password_hash(uuid, text, text) to anon, authenticated;

-- 密碼重設成功後，同步更新既有 users.password 的 bcrypt 雜湊。
create or replace function public.update_current_user_password_hash(p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if auth.uid() is null then
    raise exception '尚未登入。';
  end if;

  if p_password is null or length(p_password) < 8 then
    raise exception '密碼至少需要 8 碼。';
  end if;

  update public.users
  set password = crypt(p_password, gen_salt('bf'))
  where auth_user_id = auth.uid();

  if not found then
    raise exception '找不到使用者資料。';
  end if;

  return true;
end;
$$;

revoke all on function public.update_current_user_password_hash(text) from public;
grant execute on function public.update_current_user_password_hash(text) to authenticated;

-- 僅供受保護 Edge Function 建立內部帳號時使用。
-- 透過 service_role 呼叫，將密碼以 bcrypt 雜湊寫入既有 users.password。
create or replace function public.set_internal_user_password_hash(
  p_auth_user_id uuid,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_password is null or length(p_password) < 8 then
    raise exception '密碼至少需要 8 碼。';
  end if;

  update public.users
  set password = crypt(p_password, gen_salt('bf'))
  where auth_user_id = p_auth_user_id;

  if not found then
    raise exception '找不到內部帳號的使用者資料。';
  end if;

  return true;
end;
$$;

revoke all on function public.set_internal_user_password_hash(uuid, text) from public;
grant execute on function public.set_internal_user_password_hash(uuid, text) to service_role;

-- Auth 建立帳號時，自動建立 public.users 個人資料列。
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id bigint;
begin
  select id into v_role_id from public.roles where role = '遊客' order by id limit 1;
  if v_role_id is null then
    insert into public.roles(role) values ('遊客') returning id into v_role_id;
  end if;

  insert into public.users (auth_user_id, name, email, phone, nick_name, roles_id, state, create_date)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), '遊客'),
    lower(new.email),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'phone'), ''), ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nick_name'), ''), '遊客'),
    v_role_id,
    case when new.email_confirmed_at is null then 'pending' else 'active' end,
    now()
  )
  on conflict (auth_user_id) where auth_user_id is not null do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_auth_user_created();

-- 完成 Email 驗證後，帳號才轉為 active。
create or replace function public.handle_auth_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.users set state = 'active' where auth_user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute procedure public.handle_auth_user_confirmed();

-- 前端只在已登入者本身的 UUID 上查詢 active 狀態。
create or replace function public.is_current_visitor_active()
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.users
    where auth_user_id = auth.uid() and state = 'active'
  );
$$;

revoke all on function public.is_current_visitor_active() from public;
grant execute on function public.is_current_visitor_active() to authenticated;

-- 註冊頁於輸入 Email 後檢查 public.users 及 auth.users 是否已有帳號。
create or replace function public.is_registration_email_available(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select trim(coalesce(p_email, '')) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and not exists (select 1 from public.users where lower(email) = lower(trim(p_email)))
    and not exists (select 1 from auth.users where lower(email) = lower(trim(p_email)));
$$;

revoke all on function public.is_registration_email_available(text) from public;
grant execute on function public.is_registration_email_available(text) to anon, authenticated;

-- 以 users.email 的 Email 或自訂帳號，解析 Supabase Auth 的登入 Email。
create or replace function public.resolve_login_auth_email(p_login text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select au.email
  from public.users u
  join auth.users au on au.id = u.auth_user_id
  where lower(u.email) = lower(trim(coalesce(p_login, '')))
    and u.state = 'active'
  limit 1;
$$;

revoke all on function public.resolve_login_auth_email(text) from public;
grant execute on function public.resolve_login_auth_email(text) to anon, authenticated;
