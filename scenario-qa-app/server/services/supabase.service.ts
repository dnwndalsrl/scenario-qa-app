import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { parseCookies, setCookie, type H3Event } from "h3";

function required(name: string, value: string | undefined): string {
  if (!value) throw createError({ statusCode: 503, statusMessage: `${name} is not configured`, data: { code: "SERVICE_NOT_CONFIGURED" } });
  return value;
}

export function createUserSupabaseClient(event: H3Event): SupabaseClient {
  const config = useRuntimeConfig(event);
  const url = required("SUPABASE_URL", String(config.public.supabaseUrl || config.supabaseUrl || ""));
  const key = required("NUXT_PUBLIC_SUPABASE_ANON_KEY", String(config.public.supabaseAnonKey || ""));
  return createServerClient(url, key, {
    cookies: {
      getAll() { return Object.entries(parseCookies(event)).map(([name, value]) => ({ name, value })); },
      setAll(cookies) {
        for (const { name, value, options } of cookies) setCookie(event, name, value, { ...options, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
      }
    }
  });
}

export function createServiceSupabaseClient(): SupabaseClient {
  const config = useRuntimeConfig();
  return createClient(
    required("SUPABASE_URL", String(config.supabaseUrl || "")),
    required("SUPABASE_SERVICE_ROLE_KEY", String(config.supabaseServiceRoleKey || "")),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function requireUser(event: H3Event) {
  const client = createUserSupabaseClient(event);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw createError({ statusCode: 401, statusMessage: "로그인이 필요합니다.", data: { code: "AUTH_REQUIRED" } });
  return { client, user: data.user };
}
