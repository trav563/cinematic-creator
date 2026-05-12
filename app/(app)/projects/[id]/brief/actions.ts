"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const BriefUpdateSchema = z.object({
  scope: z.string().min(1),
  genre: z.string().min(1),
  emotional_arc: z.string().min(1),
  must_include: z.array(z.string()),
  must_not_include: z.array(z.string()),
});

export async function updateBrief(
  projectId: string,
  patch: z.infer<typeof BriefUpdateSchema>,
): Promise<Result> {
  const parsed = BriefUpdateSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Invalid brief fields" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("projects")
    .update({
      scope: parsed.data.scope,
      genre: parsed.data.genre,
      emotional_arc: parsed.data.emotional_arc,
      must_include: parsed.data.must_include,
      must_not_include: parsed.data.must_not_include,
    })
    .eq("id", projectId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/projects/${projectId}/brief`);
  return { ok: true };
}

const CharacterUpdateSchema = z.object({
  name: z.string().min(1),
  role: z.string().nullable().optional(),
  base_description: z.string().nullable().optional(),
});

export async function updateCharacter(
  characterId: string,
  patch: z.infer<typeof CharacterUpdateSchema>,
): Promise<Result> {
  const parsed = CharacterUpdateSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Invalid character fields" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("characters").update(parsed.data).eq("id", characterId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteCharacter(characterId: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("characters").delete().eq("id", characterId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function lockBrief(projectId: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("projects")
    .update({ status: "active" })
    .eq("id", projectId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
