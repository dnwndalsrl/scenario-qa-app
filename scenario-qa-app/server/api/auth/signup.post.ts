import { z } from "zod";
import { createUserSupabaseClient } from "../../services/supabase.service";
const schema = z.object({ email: z.string().email().max(320), password: z.string().min(8).max(128) });
export default defineEventHandler(async (event) => {
  if (!useRuntimeConfig(event).public.signupEnabled) throw createError({ statusCode: 403, statusMessage: "현재 신규 가입이 비활성화되어 있습니다." });
  const parsed = schema.safeParse(await readBody(event)); if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "8자 이상의 비밀번호를 입력해 주세요." });
  const { data, error } = await createUserSupabaseClient(event).auth.signUp(parsed.data);
  if (error) throw createError({ statusCode: 400, statusMessage: error.message });
  return { user: data.user ? { id: data.user.id, email: data.user.email } : null, confirmationRequired: !data.session };
});
