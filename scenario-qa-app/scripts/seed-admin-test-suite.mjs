import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const storageRoot = path.resolve(process.env.NUXT_STORAGE_ROOT || "storage");
const projectId = process.env.SEED_PROJECT_ID || "project-local-login";
const requiredScenarioNames = [
  ["관리자 로그인", "로그인 성공"],
  ["회원 목록 조회"],
  ["회원 상세 조회"],
  ["공지사항 등록"],
  ["로그아웃"]
];

const scenarios = JSON.parse(
  await readFile(path.join(storageRoot, "scenarios.json"), "utf8")
).filter((scenario) => scenario.projectId === projectId);
const selected = requiredScenarioNames.map((aliases) =>
  scenarios.find((scenario) => aliases.includes(scenario.name))
);
const missing = requiredScenarioNames
  .filter((_, index) => selected[index] === undefined)
  .map((aliases) => aliases[0]);

if (missing.length > 0) {
  console.log(
    `샘플 스위트 확장을 건너뜁니다. 먼저 시나리오를 생성해 주세요: ${missing.join(
      ", "
    )}`
  );
  process.exit(0);
}

const suitesPath = path.join(storageRoot, "test-suites.json");
const suites = JSON.parse(await readFile(suitesPath, "utf8"));
const timestamp = new Date().toISOString();
const existingIndex = suites.findIndex(
  (suite) => suite.projectId === projectId && suite.name === "관리자 기본 기능 점검"
);
const suiteId =
  existingIndex >= 0 ? suites[existingIndex].id : `suite-${randomUUID()}`;
const seeded = {
  id: suiteId,
  projectId,
  name: "관리자 기본 기능 점검",
  description: "관리자의 핵심 업무 흐름을 독립 브라우저 컨텍스트로 순차 검증합니다.",
  status: "active",
  executionPolicy: "stop_on_failure",
  defaultTimeout: 600000,
  items: selected.map((scenario, index) => ({
    id: `suite-item-${randomUUID()}`,
    suiteId,
    scenarioId: scenario.id,
    order: index + 1,
    enabled: true,
    required: true,
    createdAt: timestamp,
    updatedAt: timestamp
  })),
  createdAt:
    existingIndex >= 0 ? suites[existingIndex].createdAt : timestamp,
  updatedAt: timestamp
};

if (existingIndex >= 0) suites[existingIndex] = seeded;
else suites.push(seeded);
await writeFile(suitesPath, `${JSON.stringify(suites, null, 2)}\n`, "utf8");
console.log(`샘플 스위트를 ${selected.length}개 시나리오로 저장했습니다: ${suiteId}`);
