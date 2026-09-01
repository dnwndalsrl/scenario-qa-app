import { createClient } from "@supabase/supabase-js";
import { analysisIdFromArgs } from "./analysis-id";

const analysisId = analysisIdFromArgs(process.argv.slice(2));
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error("SUPABASE_URL is required");
if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

const projectRef = (() => {
  try {
    return new URL(url).hostname.split(".")[0] || "unknown";
  } catch {
    return "invalid-url";
  }
})();

const client = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await client
  .from("analyses")
  .select("id,status,authentication_enabled")
  .eq("id", analysisId)
  .maybeSingle();

if (error) {
  throw new Error(`Cannot read the analysis from Supabase project ${projectRef}: ${error.message}`);
}

if (!data) {
  throw new Error(
    `Analysis ${analysisId} was not found in Supabase project ${projectRef}. ` +
      "Check the GitHub Actions SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY repository secrets."
  );
}

if (data.authentication_enabled && !process.env.ANALYSIS_CREDENTIAL_ENCRYPTION_KEY) {
  throw new Error("ANALYSIS_CREDENTIAL_ENCRYPTION_KEY is required for an authenticated analysis");
}

console.log(`Runner input is valid. Analysis ${analysisId} (${data.status}) exists in Supabase project ${projectRef}.`);
