import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../pages/analyses/[analysisId].vue", import.meta.url), "utf8");

describe("analysis detail live updates", () => {
  it("uses database change events instead of an API polling loop", () => {
    expect(source).toContain('"postgres_changes"');
    expect(source).toContain('table: "analyses"');
    expect(source).toContain("supabase.realtime.setAuth(sessionData.session.access_token)");
    expect(source).toContain("if (row.id === targetId) applyRealtimeUpdate(row)");
    expect(source).toContain("watch(");
    expect(source).not.toContain("schedulePoll");
    expect(source).not.toContain("pollIntervalMs");
    expect(source).not.toContain("setInterval");
  });

  it("keeps only a one-shot stale job check and refreshes the full report at a terminal state", () => {
    expect(source).toContain("staleTimer = setTimeout");
    expect(source).toContain("if (isTerminal(status)) {");
    expect(source).toContain("void refreshDetail()");
  });
});
