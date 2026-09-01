import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisAuthenticationInput, BrowserAuthentication, EncryptedAuthenticationPayload } from "../../shared/types/authentication";
import { decryptAnalysisAuthentication, encryptAnalysisAuthentication } from "../security/analysis-authentication";

export async function saveAnalysisAuthentication(client: SupabaseClient, analysisId: string, userId: string, input: AnalysisAuthenticationInput, secret: string): Promise<void> {
  const { error } = await client.from("analysis_authentications").insert({
    analysis_id: analysisId,
    user_id: userId,
    login_url: input.loginUrl,
    username_hint: maskUsername(input.username),
    encrypted_payload: encryptAnalysisAuthentication(input, secret)
  });
  if (error) throw error;
}

export async function loadAnalysisAuthentication(client: SupabaseClient, analysisId: string, secret = process.env.ANALYSIS_CREDENTIAL_ENCRYPTION_KEY): Promise<BrowserAuthentication | undefined> {
  const { data, error } = await client.from("analysis_authentications").select("encrypted_payload").eq("analysis_id", analysisId).maybeSingle();
  if (error && ["42P01", "PGRST205"].includes(error.code || "")) return undefined;
  if (error) throw error;
  if (!data) return undefined;
  return decryptAnalysisAuthentication(data.encrypted_payload as EncryptedAuthenticationPayload, secret);
}

function maskUsername(value: string): string {
  const at = value.indexOf("@");
  if (at > 1) return `${value.slice(0, 2)}***${value.slice(at)}`.slice(0, 80);
  return `${value.slice(0, 2)}***`.slice(0, 80);
}
