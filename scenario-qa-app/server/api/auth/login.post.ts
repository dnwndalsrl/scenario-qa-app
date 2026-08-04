import { z } from "zod";
import { createUserSupabaseClient } from "../../services/supabase.service";
const schema = z.object({ email: z.string().email().max(320), password: z.string().min(8).max(128) });
export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event)); if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "이메일과 비밀번호를 확인해 주세요." });
  const { data, error } = await createUserSupabaseClient(event).auth.signInWithPassword(parsed.data);
  if (error || !data.user) throw createError({ statusCode: 401, statusMessage: "로그인 정보가 올바르지 않습니다." });
  return { user: { id: data.user.id, email: data.user.email } };
});
