import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";

const fileLocks = new Map<string, Promise<void>>();

export class StorageDataError extends Error {
  override readonly name = "StorageDataError";
}

export function getStorageRoot(): string {
  const configured = process.env.NUXT_STORAGE_ROOT;
  return configured === undefined || configured.trim().length === 0
    ? path.resolve(process.cwd(), "storage")
    : path.resolve(configured);
}

export function getStorageFile(filename: string): string {
  return path.join(getStorageRoot(), filename);
}

export async function readJsonArray<T>(filePath: string): Promise<T[]> {
  return withFileLock(filePath, () => readJsonArrayUnlocked<T>(filePath));
}

async function readJsonArrayUnlocked<T>(filePath: string): Promise<T[]> {
  try {
    await recoverInterruptedWindowsReplacement(filePath);
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      throw new StorageDataError(
        `저장소 파일은 JSON 배열이어야 합니다: ${path.basename(filePath)}`
      );
    }
    return parsed as T[];
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      await writeJsonArrayAtomic(filePath, []);
      return [];
    }
    if (error instanceof StorageDataError) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw new StorageDataError(
        `저장소 JSON이 올바르지 않습니다: ${path.basename(filePath)}`
      );
    }
    throw error;
  }
}

export async function mutateJsonArray<T, R>(
  filePath: string,
  mutator: (items: T[]) => R | Promise<R>
): Promise<R> {
  return withFileLock(filePath, async () => {
    const items = await readJsonArrayUnlocked<T>(filePath);
    const result = await mutator(items);
    await writeJsonArrayAtomic(filePath, items);
    return result;
  });
}

export async function readJsonObject<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf8");
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new StorageDataError(
      `결과 JSON이 올바르지 않습니다: ${path.basename(filePath)}`
    );
  }
}

export function resolveAppRelativePath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new StorageDataError("절대 파일 경로는 허용되지 않습니다.");
  }
  return path.resolve(process.cwd(), relativePath);
}

export function assertPathInside(
  allowedDirectory: string,
  candidatePath: string
): void {
  const allowed = path.resolve(allowedDirectory);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(allowed, candidate);
  if (
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  ) {
    throw new StorageDataError("허용된 파일 디렉터리 밖에는 접근할 수 없습니다.");
  }
}

export async function removeAppRelativeFile(
  relativePath: string,
  allowedDirectory: string
): Promise<void> {
  const absolutePath = resolveAppRelativePath(relativePath);
  assertPathInside(allowedDirectory, absolutePath);
  await rm(absolutePath, { force: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const information = await stat(filePath);
    return information.isFile();
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function writeJsonArrayAtomic<T>(
  filePath: string,
  items: T[]
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const serialized = `${JSON.stringify(items, null, 2)}\n`;
  JSON.parse(serialized);
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, serialized, "utf8");
  if (await fileExists(filePath)) {
    await createBoundedBackup(filePath);
  }
  try {
    if (process.platform === "win32" && (await fileExists(filePath))) {
      await replaceFileOnWindows(temporaryPath, filePath);
    } else {
      await renameWithRetry(temporaryPath, filePath);
    }
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function replaceFileOnWindows(source: string, destination: string): Promise<void> {
  const swapPath = `${destination}.swap`;
  await rm(swapPath, { force: true });
  await renameWithRetry(destination, swapPath);
  try {
    await renameWithRetry(source, destination);
    await rm(swapPath, { force: true });
  } catch (error: unknown) {
    if (!(await fileExists(destination)) && (await fileExists(swapPath))) {
      await renameWithRetry(swapPath, destination).catch(() => undefined);
    }
    throw error;
  }
}

async function recoverInterruptedWindowsReplacement(filePath: string): Promise<void> {
  if (process.platform !== "win32") return;
  const swapPath = `${filePath}.swap`;
  if (!(await fileExists(swapPath))) return;
  if (await fileExists(filePath)) {
    await rm(swapPath, { force: true });
    return;
  }
  await renameWithRetry(swapPath, filePath);
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
  const retryableCodes = new Set(["EACCES", "EBUSY", "EPERM"]);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error: unknown) {
      if (
        !isNodeError(error) ||
        !retryableCodes.has(error.code ?? "") ||
        attempt === 7
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

async function createBoundedBackup(filePath: string): Promise<void> {
  const backupLimit = positiveInteger(process.env.STORAGE_BACKUP_COUNT, 5);
  const backupDirectory = path.join(path.dirname(filePath), "backups");
  await mkdir(backupDirectory, { recursive: true });
  const prefix = `${path.basename(filePath)}.`;
  const backupPath = path.join(backupDirectory, `${prefix}${Date.now()}.bak`);
  await copyFile(filePath, backupPath);
  const backups = (await readdir(backupDirectory))
    .filter((name) => name.startsWith(prefix) && name.endsWith(".bak"))
    .sort();
  for (const stale of backups.slice(0, Math.max(0, backups.length - backupLimit))) {
    await rm(path.join(backupDirectory, stale), { force: true });
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function withFileLock<R>(
  filePath: string,
  task: () => Promise<R>
): Promise<R> {
  const previous = fileLocks.get(filePath) ?? Promise.resolve();
  const operation = previous.then(task, task);
  fileLocks.set(
    filePath,
    operation.then(
      () => undefined,
      () => undefined
    )
  );
  return operation;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
