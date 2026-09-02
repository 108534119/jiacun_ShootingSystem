import { createClient } from "@supabase/supabase-js";

// Browser-safe values only. Never place a secret/service-role key in frontend code.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://pwrsokknkdkwifnmmjbp.supabase.co";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_PndAROWRpAC5ffNRooryxg_upv61YQK";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
});
