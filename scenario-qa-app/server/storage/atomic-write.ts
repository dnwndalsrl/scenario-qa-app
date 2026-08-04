import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../../shared/errors";

const locks = new Map<string, Promise<void>>();

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const previous = locks.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  locks.set(filePath, previous.then(() => current));
  await previous;
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    const json = JSON.stringify(value, null, 2);
    JSON.parse(json);
    await writeFile(temporary, json, { encoding: "utf8", flag: "wx" });
    await rename(temporary, filePath);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw new AppError("STORAGE_WRITE_FAILED", undefined, 500, error instanceof Error ? error.message : String(error));
  } finally {
    release();
    if (locks.get(filePath) === current) locks.delete(filePath);
  }
}

export async function readJson<T>(filePath: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(filePath, "utf8")) as T; }
  catch (error: any) { if (error?.code === "ENOENT") return undefined; throw error; }
}
