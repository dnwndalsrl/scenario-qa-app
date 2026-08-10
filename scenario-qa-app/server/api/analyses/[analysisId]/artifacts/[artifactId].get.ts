import { getOwnedAnalysis } from "../../../../services/analysis-records.service";
import { requireUser } from "../../../../services/supabase.service";
export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event); const analysisId = getRouterParam(event, "analysisId") || "";
  await getOwnedAnalysis(client, analysisId);
  const { data: artifact, error } = await client.from("artifacts").select("storage_path").eq("analysis_id", analysisId).eq("source_id", getRouterParam(event, "artifactId") || "").single();
  if (error || !artifact) throw createError({ statusCode: 404, statusMessage: "아티팩트를 찾을 수 없습니다." });
  const { data, error: signedError } = await client.storage.from("qa-artifacts").createSignedUrl(artifact.storage_path, 60);
  if (signedError || !data?.signedUrl) throw createError({ statusCode: 500, statusMessage: "다운로드 주소 생성에 실패했습니다." });
  return sendRedirect(event, data.signedUrl, 302);
});
