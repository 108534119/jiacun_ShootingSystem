import { createClient } from "npm:@supabase/supabase-js@2";

type InternalUser = {
  login_id: string;
  auth_email: string;
  password: string;
  name: string;
  nick_name?: string;
  phone?: string;
  role_id: 2 | 3 | 4;
};

type RequestBody = {
  users: InternalUser[];
};

const FUNCTION_VERSION = "2026-09-01-password-hash-v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function validateUser(value: unknown, index: number) {
  const label = "第 " + (index + 1) + " 筆";
  if (typeof value !== "object" || value === null) {
    return [label + "必須是一個帳號物件。"];
  }

  const user = value as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof user.login_id !== "string" || user.login_id.trim().length === 0) {
    errors.push(label + "的 login_id 必填，且必須是文字。");
  }
  if (
    typeof user.auth_email !== "string" ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user.auth_email.trim())
  ) {
    errors.push(label + "的 auth_email 必須是有效電子郵件。");
  }
  if (typeof user.password !== "string" || user.password.length < 8) {
    errors.push(label + "的 password 必須是文字且至少 8 碼。");
  }
  if (typeof user.name !== "string" || user.name.trim().length === 0) {
    errors.push(label + "的 name 必填，且必須是文字。");
  }
  if (user.role_id !== 2 && user.role_id !== 3 && user.role_id !== 4) {
    errors.push(label + "的 role_id 只能是 2（員工）、3（管理員）或 4（總管理員）。");
  }
  return errors;
}

function getSupabaseAdminKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const keys = JSON.parse(secretKeys) as Record<string, string>;
      if (keys.default) return keys.default;
    } catch {
      // 舊專案可能仍使用 SUPABASE_SERVICE_ROLE_KEY，改由下方相容處理。
    }
  }

  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "只接受 POST 請求。" }, 405);
  }

  const expectedToken = Deno.env.get("INTERNAL_SEED_TOKEN");
  const authorization = request.headers.get("Authorization");
  if (!expectedToken || authorization !== "Bearer " + expectedToken) {
    return jsonResponse({ error: "未授權。" }, 401);
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "請求內容不是有效的 JSON。" }, 400);
  }

  if (!Array.isArray(body.users) || body.users.length === 0) {
    return jsonResponse(
      { error: "users 必須是至少一筆帳號資料。" },
      400,
    );
  }

  const validationErrors = body.users.flatMap(validateUser);
  if (validationErrors.length > 0) {
    return jsonResponse({ error: "帳號資料格式有誤。", details: validationErrors }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const adminKey = getSupabaseAdminKey();
  if (!supabaseUrl || !adminKey) {
    return jsonResponse({ error: "伺服器缺少 Supabase 設定。" }, 500);
  }

  const supabase = createClient(supabaseUrl, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results: Array<{
    login_id: string;
    role_id: number;
    role: string;
    auth_user_id: string;
    password_hash_saved: boolean;
  }> = [];

  for (const user of body.users) {
    const loginId = user.login_id.trim();
    const authEmail = user.auth_email.trim().toLowerCase();

    const { data: roleData, error: roleError } = await supabase
      .from("roles")
      .select("id, role")
      .eq("id", user.role_id)
      .maybeSingle();

    if (roleError || !roleData) {
      return jsonResponse(
        { error: "找不到角色 ID：" + user.role_id + "。請先確認 roles 資料表已有這筆資料。" },
        400,
      );
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: authEmail,
      password: user.password,
      email_confirm: true,
      user_metadata: { name: user.name.trim(), nick_name: user.nick_name?.trim() || user.name.trim() },
    });

    if (createError || !created.user) {
      return jsonResponse(
        { error: loginId + " 建立失敗：" + (createError?.message || "無法建立 Auth 帳號。") },
        400,
      );
    }

    const { error: profileError } = await supabase
      .from("users")
      .update({
        name: user.name.trim(),
        email: loginId,
        phone: user.phone?.trim() || null,
        nick_name: user.nick_name?.trim() || user.name.trim(),
        roles_id: roleData.id,
        state: "active",
      })
      .eq("auth_user_id", created.user.id);

    if (profileError) {
      await supabase.auth.admin.deleteUser(created.user.id);
      return jsonResponse(
        { error: loginId + " 的 users 對應失敗，已回復剛建立的 Auth 帳號：" + profileError.message },
        500,
      );
    }

    const { error: passwordHashError } = await supabase.rpc("set_internal_user_password_hash", {
      p_auth_user_id: created.user.id,
      p_password: user.password,
    });

    if (passwordHashError) {
      await supabase.auth.admin.deleteUser(created.user.id);
      return jsonResponse(
        {
          error:
            loginId +
            " 的密碼雜湊寫入失敗，已回復剛建立的 Auth 帳號：" +
            passwordHashError.message,
        },
        500,
      );
    }

    const { data: profileCheck, error: profileCheckError } = await supabase
      .from("users")
      .select("password")
      .eq("auth_user_id", created.user.id)
      .single();

    if (profileCheckError || !profileCheck?.password) {
      await supabase.auth.admin.deleteUser(created.user.id);
      return jsonResponse(
        {
          error:
            loginId +
            " 的密碼雜湊未成功寫入，已回復剛建立的 Auth 帳號：" +
            (profileCheckError?.message || "users.password 仍是空值。"),
        },
        500,
      );
    }

    results.push({
      login_id: loginId,
      role_id: roleData.id,
      role: roleData.role,
      auth_user_id: created.user.id,
      password_hash_saved: true,
    });
  }

  return jsonResponse({
    message: "內部帳號建立完成。",
    function_version: FUNCTION_VERSION,
    users: results,
  });
});
