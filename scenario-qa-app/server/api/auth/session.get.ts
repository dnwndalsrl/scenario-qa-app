import { createUserSupabaseClient } from "../../services/supabase.service";
export default defineEventHandler(async (event) => {
  const { data } = await createUserSupabaseClient(event).auth.getUser();
  return { authenticated: Boolean(data.user), user: data.user ? { id: data.user.id, email: data.user.email } : null };
});
