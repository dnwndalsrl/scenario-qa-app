import type { StoredTestSchedule } from "../schedules/types/storage.js";
import { getStorageFile } from "../utils/file-storage.js";
import { JsonArrayRepository } from "./json-array.repository.js";

export class TestScheduleRepository extends JsonArrayRepository<StoredTestSchedule> {
  constructor() {
    super(getStorageFile("test-schedules.json"));
  }

  async listByProject(projectId: string): Promise<StoredTestSchedule[]> {
    return (await this.list()).filter(
      (item) => item.projectId === projectId && item.deletedAt === undefined
    );
  }

  async listBySuite(suiteId: string): Promise<StoredTestSchedule[]> {
    return (await this.list()).filter(
      (item) => item.suiteId === suiteId && item.deletedAt === undefined
    );
  }

  async listDue(now: string): Promise<StoredTestSchedule[]> {
    return (await this.list())
      .filter(
        (item) =>
          item.status === "active" &&
          item.deletedAt === undefined &&
          item.nextRunAt !== undefined &&
          item.nextRunAt <= now
      )
      .sort((left, right) =>
        (left.nextRunAt ?? "").localeCompare(right.nextRunAt ?? "")
      );
  }

  async patch(
    id: string,
    changes: Partial<StoredTestSchedule>
  ): Promise<StoredTestSchedule | null> {
    const current = await this.findById(id);
    if (current === null) return null;
    return this.update(id, { ...current, ...changes, id: current.id });
  }

  async deactivateBySuite(suiteId: string, timestamp: string): Promise<void> {
    const schedules = await this.listBySuite(suiteId);
    for (const schedule of schedules) {
      await this.patch(schedule.id, { status: "inactive", updatedAt: timestamp });
    }
  }

  async deleteByProject(projectId: string): Promise<StoredTestSchedule[]> {
    return this.deleteWhere((item) => item.projectId === projectId);
  }
}
