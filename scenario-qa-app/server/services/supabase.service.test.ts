import { describe, expect, it } from "vitest";
import { resolveSupabaseUrl } from "./supabase.service";

describe("Supabase runtime URL", () => {
  it("uses the same public project URL for user and service clients", () => {
    expect(resolveSupabaseUrl({
      supabaseUrl: "https://stale-project.supabase.co",
      public: { supabaseUrl: "https://current-project.supabase.co" }
    })).toBe("https://current-project.supabase.co");
  });

  it("falls back to the private URL when no public URL is configured", () => {
    expect(resolveSupabaseUrl({ supabaseUrl: "https://private-project.supabase.co" })).toBe("https://private-project.supabase.co");
  });
});
