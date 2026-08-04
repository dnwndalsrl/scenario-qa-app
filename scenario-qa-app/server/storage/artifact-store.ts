import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAnalysisConfig } from "../config";
import { AppError } from "../../shared/errors";
import { createId } from "../utils/id";

export interface StoredArtifact { id: string; analysisId: string; path: string; contentType: "image/png"; size: number; }
const artifactIndex = new Map<string, StoredArtifact>();

export async function savePngArtifact(analysisId: string, bytes: Buffer): Promise<StoredArtifact> {
  const config = getAnalysisConfig();
  if (bytes.length > config.artifactMaxBytes) throw new AppError("ARTIFACT_SAVE_FAILED", "스크린샷 크기 제한을 초과했습니다.", 413);
  const id = createId("artifact");
  const directory = path.join(config.storageRoot, "artifacts", analysisId);
  const filePath = path.join(directory, `${id}.png`);
  try { await mkdir(directory, { recursive: true }); await writeFile(filePath, bytes, { flag: "wx" }); }
  catch (error) { throw new AppError("ARTIFACT_SAVE_FAILED", undefined, 500, error instanceof Error ? error.message : String(error)); }
  const artifact = { id, analysisId, path: filePath, contentType: "image/png" as const, size: bytes.length };
  artifactIndex.set(`${analysisId}:${id}`, artifact);
  return artifact;
}

export async function readArtifact(analysisId: string, artifactId: string): Promise<{ artifact: StoredArtifact; bytes: Buffer } | undefined> {
  if (!/^[a-z0-9-]+$/i.test(analysisId) || !/^[a-z0-9-]+$/i.test(artifactId)) return undefined;
  const indexed = artifactIndex.get(`${analysisId}:${artifactId}`);
  const filePath = indexed?.path ?? path.join(getAnalysisConfig().storageRoot, "artifacts", analysisId, `${artifactId}.png`);
  const info = await stat(filePath).catch(() => undefined);
  if (!info?.isFile()) return undefined;
  return { artifact: indexed ?? { id: artifactId, analysisId, path: filePath, contentType: "image/png", size: info.size }, bytes: await readFile(filePath) };
}
