import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
let browserClient: SupabaseClient | undefined;
export function useSupabaseBrowser(): SupabaseClient {
  if (import.meta.server) throw new Error("Supabase browser client is only available in the browser");
  const config = useRuntimeConfig();
  if (!browserClient) browserClient = createBrowserClient(String(config.public.supabaseUrl), String(config.public.supabaseAnonKey));
  return browserClient;
}
