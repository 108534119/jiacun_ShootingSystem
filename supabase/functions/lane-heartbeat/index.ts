import { createClient } from "npm:@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-device-key", "Content-Type": "application/json" };
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers });

function serviceRoleKey() {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
  return keys.default ?? Object.values(keys)[0] ?? "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply({ error: "只接受 POST 請求。" }, 405);
  try {
    const body = await request.json();
    const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
    const deviceKey = request.headers.get("x-device-key") ?? "";
    const keys = JSON.parse(Deno.env.get("LANE_DEVICE_KEYS_JSON") ?? "{}") as Record<string, string>;
    if (!deviceId || !deviceKey || keys[deviceId] !== deviceKey) return reply({ error: "靶機識別或裝置金鑰無效。" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const key = serviceRoleKey();
    if (!url || !key) return reply({ error: "伺服器尚未完成設定。" }, 500);
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.from("lanes").update({ last_seen_at: new Date().toISOString() }).eq("address", deviceId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return reply({ error: "找不到對應靶機。" }, 404);
    return reply({ ok: true, lane_id: data.id });
  } catch (error) {
    console.error(error);
    return reply({ error: "靶機心跳更新失敗。" }, 500);
  }
});
