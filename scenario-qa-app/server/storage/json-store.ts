import { readdir } from "node:fs/promises";
import path from "node:path";
import { getAnalysisConfig } from "../config";
import { atomicWriteJson, readJson } from "./atomic-write";

export type StoreCollection = "analyses" | "crawl-pages" | "site-maps" | "snapshots" | "page-analyses" | "site-analyses" | "generated-tests" | "test-runs";

function collectionPath(collection: StoreCollection): string {
  return path.join(getAnalysisConfig().storageRoot, collection);
}
function safeId(id: string): string {
  if (!/^[a-z0-9-]{8,100}$/i.test(id)) throw new Error("Invalid storage id");
  return id;
}
export async function saveRecord<T extends { id: string }>(collection: StoreCollection, value: T): Promise<T> {
  await atomicWriteJson(path.join(collectionPath(collection), `${safeId(value.id)}.json`), value);
  return value;
}
export async function getRecord<T>(collection: StoreCollection, id: string): Promise<T | undefined> {
  return readJson<T>(path.join(collectionPath(collection), `${safeId(id)}.json`));
}
export async function listRecords<T>(collection: StoreCollection): Promise<T[]> {
  const directory = collectionPath(collection);
  const files = await readdir(directory).catch((error: any) => error?.code === "ENOENT" ? [] : Promise.reject(error));
  const values = await Promise.all(files.filter((file) => file.endsWith(".json")).map((file) => readJson<T>(path.join(directory, file))));
  return values.filter((value) => value !== undefined) as T[];
}
