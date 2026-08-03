import type { TestScheduleExecution } from "../../shared/types/test-schedule.js";
import {
  getStorageFile,
  mutateJsonArray
} from "../utils/file-storage.js";
import { JsonArrayRepository } from "./json-array.repository.js";

export class TestScheduleExecutionRepository extends JsonArrayRepository<TestScheduleExecution> {
  private readonly storageFile = getStorageFile("test-schedule-executions.json");

  constructor() {
    super(getStorageFile("test-schedule-executions.json"));
  }

  async createUnique(value: TestScheduleExecution): Promise<TestScheduleExecution | null> {
    return mutateJsonArray<TestScheduleExecution, TestScheduleExecution | null>(
      this.storageFile,
      (items) => {
        if (
          items.some(
            (item) =>
              item.scheduleId === value.scheduleId &&
              item.scheduledFor === value.scheduledFor
          )
        ) {
          return null;
        }
        items.push(value);
        return value;
      }
    );
  }

  async listBySchedule(scheduleId: string): Promise<TestScheduleExecution[]> {
    return (await this.list())
      .filter((item) => item.scheduleId === scheduleId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listByProject(projectId: string): Promise<TestScheduleExecution[]> {
    return (await this.list())
      .filter((item) => item.projectId === projectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findActiveBySchedule(scheduleId: string): Promise<TestScheduleExecution | null> {
    return (
      (await this.list()).find(
        (item) =>
          item.scheduleId === scheduleId &&
          ["detected", "queued", "running"].includes(item.status)
      ) ?? null
    );
  }

  async findQueuedBySchedule(scheduleId: string): Promise<TestScheduleExecution | null> {
    return (
      (await this.list()).find(
        (item) => item.scheduleId === scheduleId && item.status === "queued"
      ) ?? null
    );
  }

  async listQueued(): Promise<TestScheduleExecution[]> {
    return (await this.list()).filter((item) => item.status === "queued");
  }

  async patch(
    id: string,
    changes: Partial<TestScheduleExecution>
  ): Promise<TestScheduleExecution | null> {
    const current = await this.findById(id);
    if (current === null) return null;
    return this.update(id, { ...current, ...changes, id: current.id });
  }

  async deleteByProject(projectId: string): Promise<TestScheduleExecution[]> {
    return this.deleteWhere((item) => item.projectId === projectId);
  }
}
