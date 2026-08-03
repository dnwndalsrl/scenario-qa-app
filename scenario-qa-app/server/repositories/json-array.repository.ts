import { mutateJsonArray, readJsonArray } from "../utils/file-storage.js";

export interface Identifiable {
  id: string;
}

export class JsonArrayRepository<T extends Identifiable> {
  constructor(private readonly filePath: string) {}

  async list(): Promise<T[]> {
    return readJsonArray<T>(this.filePath);
  }

  async findById(id: string): Promise<T | null> {
    const items = await this.list();
    return items.find((item) => item.id === id) ?? null;
  }

  async create(value: T): Promise<T> {
    return mutateJsonArray<T, T>(this.filePath, (items) => {
      if (items.some((item) => item.id === value.id)) {
        throw new Error(`중복 ID입니다: ${value.id}`);
      }
      items.push(value);
      return value;
    });
  }

  async update(id: string, value: T): Promise<T | null> {
    return mutateJsonArray<T, T | null>(this.filePath, (items) => {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) {
        return null;
      }
      items[index] = value;
      return value;
    });
  }

  async delete(id: string): Promise<boolean> {
    return mutateJsonArray<T, boolean>(this.filePath, (items) => {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) {
        return false;
      }
      items.splice(index, 1);
      return true;
    });
  }

  async deleteWhere(predicate: (value: T) => boolean): Promise<T[]> {
    return mutateJsonArray<T, T[]>(this.filePath, (items) => {
      const deleted = items.filter(predicate);
      const retained = items.filter((item) => !predicate(item));
      items.splice(0, items.length, ...retained);
      return deleted;
    });
  }
}
