import type { TestProject } from "../../shared/types/project.js";
import { getStorageFile } from "../utils/file-storage.js";
import { JsonArrayRepository } from "./json-array.repository.js";

export class ProjectRepository extends JsonArrayRepository<TestProject> {
  constructor() {
    super(getStorageFile("projects.json"));
  }
}
