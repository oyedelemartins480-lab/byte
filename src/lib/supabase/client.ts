import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "./env";

let client: SupabaseClient | undefined;

/** One browser client per tab, so realtime channels share a socket. */
export function createClient(): SupabaseClient {
  if (!client) client = createBrowserClient(supabaseUrl(), supabaseKey());
  return client;
}
