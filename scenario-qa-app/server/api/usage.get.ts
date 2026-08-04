import { requireUser } from "../services/supabase.service";
export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event); const { data, error } = await client.rpc("get_usage_summary");
  if (error) throw createError({ statusCode: 500, statusMessage: "사용량을 조회하지 못했습니다." }); return data;
});
