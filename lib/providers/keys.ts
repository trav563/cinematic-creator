import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/keys";

export type ProviderId = "anthropic" | "google_ai_studio" | "kling";

/**
 * Fetch and decrypt a stored provider API key for a user.
 * Use only in trusted server contexts (server actions, Inngest workers).
 */
export async function getProviderKey(
  userId: string,
  provider: ProviderId,
): Promise<string> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("provider_credentials")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("provider", provider)
    .single();

  if (error || !data) {
    throw new Error(`Missing ${provider} API key. Add it at /settings/keys.`);
  }
  return decryptApiKey(data.encrypted_key);
}
