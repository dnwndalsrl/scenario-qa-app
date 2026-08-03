import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureDirectory(directoryPath: string): Promise<void> {
  await mkdir(directoryPath, { recursive: true });
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  const content = await readFile(filePath, "utf8");
  try {
    return JSON.parse(content) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`JSON 파일을 파싱할 수 없습니다 (${filePath}): ${message}`);
  }
}

export async function writeJsonFileAtomic(
  filePath: string,
  value: unknown
): Promise<void> {
  await ensureDirectory(path.dirname(filePath));
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export function timestampForFile(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function safeFileSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "_");
  return sanitized.length > 0 ? sanitized : "unknown";
}

export function toPortableRelativePath(
  projectRoot: string,
  absolutePath: string
): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}
