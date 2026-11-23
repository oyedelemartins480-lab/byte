import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * Server-only client with the secret (service role) key. It bypasses row-level
 * security, so only use it after checking the signed-in user may do the action.
 */
export function adminKey() {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

let admin: SupabaseClient | undefined;
export function createAdminClient() {
  const key = adminKey();
  if (!key) throw new Error("Missing SUPABASE_SECRET_KEY. AI notes, recaps and transcripts need it.");
  if (!admin) admin = createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
