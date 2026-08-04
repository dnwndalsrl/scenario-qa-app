import { createUserSupabaseClient } from "../../services/supabase.service";
export default defineEventHandler(async (event) => { await createUserSupabaseClient(event).auth.signOut(); return { ok: true }; });
