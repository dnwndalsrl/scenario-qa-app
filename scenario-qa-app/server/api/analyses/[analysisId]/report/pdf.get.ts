import { getAnalysisDetailFromSupabase } from "../../../../services/analysis-records.service";
import { buildQaReportPdf, qaReportPdfFileName, type QaReportScreenshot } from "../../../../services/qa-report-pdf.service";
import { rowToQaDefect } from "../../../../services/qa-defect.service";
import { createServiceSupabaseClient, requireUser } from "../../../../services/supabase.service";
import { latestTestRuns } from "../../../../../shared/utils/test-run-history";

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  throw createError({ statusCode: 500, statusMessage: "PDF 한글 폰트를 불러오지 못했습니다." });
}

function screenshotRequests(detail: Awaited<ReturnType<typeof getAnalysisDetailFromSupabase>>) {
  const tests = new Map(detail.generatedTests.map((test) => [test.id, test]));
  const requests = new Map<string, string>();
  latestTestRuns(detail.testRuns).filter((run) => ["failed", "error", "blocked"].includes(run.status)).forEach((run) => {
    const title = tests.get(run.scenarioId)?.title || "실패 테스트";
    run.stepResults.filter((step) => step.screenshotArtifactId).forEach((step) => requests.set(step.screenshotArtifactId!, `${title} · ${step.description}`));
    run.screenshotArtifactIds.forEach((id) => { if (!requests.has(id)) requests.set(id, `${title} · 실행 화면`); });
  });
  return requests;
}

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const detail = await getAnalysisDetailFromSupabase(client, analysisId);
  if (detail.analysis.processStage !== "report_complete") throw createError({ statusCode: 409, statusMessage: "완료된 분석만 PDF로 내보낼 수 있습니다." });

  const admin = createServiceSupabaseClient(event);
  const { data: defectRows, error: defectError } = await admin.from("analysis_issues").select("id,analysis_id,title,severity,payload,created_at").eq("analysis_id", analysisId).eq("kind", "defect").order("created_at", { ascending: false });
  if (defectError) throw createError({ statusCode: 500, statusMessage: "결함 정보를 조회하지 못했습니다." });
  const defects = (defectRows || []).map(rowToQaDefect);

  const requests = screenshotRequests(detail);
  defects.forEach((defect) => defect.screenshotArtifactIds.forEach((id) => { if (!requests.has(id)) requests.set(id, `${defect.title} · 결함 근거`); }));
  const selected = [...requests.entries()].slice(0, 6);
  const screenshots: QaReportScreenshot[] = [];
  if (selected.length) {
    const { data: artifacts } = await admin.from("artifacts").select("source_id,storage_path").eq("analysis_id", analysisId).in("source_id", selected.map(([id]) => id));
    const paths = new Map((artifacts || []).map((item) => [item.source_id, item.storage_path]));
    for (const [id, label] of selected) {
      const path = paths.get(id);
      if (!path) continue;
      const { data } = await admin.storage.from("qa-artifacts").download(path);
      if (data) screenshots.push({ id, label, data: Buffer.from(await data.arrayBuffer()) });
    }
  }

  const fonts = useStorage("assets:pdf-fonts");
  const [regular, bold] = await Promise.all([fonts.getItemRaw("NotoSansKR-Regular.woff"), fonts.getItemRaw("NotoSansKR-Bold.woff")]);
  const fileName = qaReportPdfFileName(detail);
  const pdf = await buildQaReportPdf(detail, defects, screenshots, { regular: toBuffer(regular), bold: toBuffer(bold) });
  setResponseHeader(event, "Content-Type", "application/pdf");
  setResponseHeader(event, "Content-Disposition", `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return pdf;
});
