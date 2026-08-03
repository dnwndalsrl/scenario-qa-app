import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveEnvironmentPlaceholders } from "./environment.js";

describe("environment placeholder security", () => {
  it("treats test account identifiers and passwords as sensitive", () => {
    const result = resolveEnvironmentPlaceholders({ id: "{{TEST_LOGIN_ID}}", password: "{{TEST_LOGIN_PASSWORD}}" }, { TEST_LOGIN_ID: "qa-user", TEST_LOGIN_PASSWORD: "secret" });
    assert.deepEqual(new Set(result.sensitiveValues), new Set(["qa-user", "secret"]));
  });
});
