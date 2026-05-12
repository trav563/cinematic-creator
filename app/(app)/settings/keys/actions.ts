"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { encryptApiKey } from "@/lib/crypto/keys";

const ProviderSchema = z.enum(["anthropic", "google_ai_studio", "kling"]);

type Result = { ok: true } | { ok: false; error: string };

export async function saveProviderKey(provider: string, plaintext: string): Promise<Result> {
  const parsed = ProviderSchema.safeParse(provider);
  if (!parsed.success) return { ok: false, error: "Unknown provider." };
  if (!plaintext || plaintext.length < 8) return { ok: false, error: "Key looks too short." };

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in." };

  const encrypted = encryptApiKey(plaintext.trim());

  const { error } = await supabase.from("provider_credentials").upsert(
    {
      user_id: userData.user.id,
      provider: parsed.data,
      encrypted_key: encrypted,
    },
    { onConflict: "user_id,provider" },
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/keys");
  return { ok: true };
}

export async function deleteProviderKey(provider: string): Promise<Result> {
  const parsed = ProviderSchema.safeParse(provider);
  if (!parsed.success) return { ok: false, error: "Unknown provider." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("provider_credentials")
    .delete()
    .eq("provider", parsed.data);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/keys");
  return { ok: true };
}
