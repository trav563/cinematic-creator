import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getProviderKey } from "@/lib/providers/keys";
import { generateImage } from "@/lib/providers/gemini";
import { downloadAsServiceBase64, uploadAsService } from "@/lib/storage";
import { buildCharacterModelSheetPrompt } from "@/lib/prompts/character-prompts";
import type { StylePreset } from "@/lib/prompts/loader";

export interface GenerateCharacterVariationEventData {
  jobId: string;
  projectId: string;
  characterId: string;
  userId: string;
  editInstruction?: string;
  variationCount?: number; // default 3
}

export const generateCharacterVariationFunction = inngest.createFunction(
  {
    id: "generate-character-variation",
    name: "Generate character model-sheet variations",
    triggers: [{ event: "character/generate_variation" }],
    retries: 1,
  },
  async ({ event, step }) => {
    const data = event.data as GenerateCharacterVariationEventData;
    const variationCount = data.variationCount ?? 3;
    const supabase = createSupabaseServiceClient();

    await step.run("mark-running", async () => {
      await supabase.from("jobs").update({ status: "running" }).eq("id", data.jobId);
    });

    const context = await step.run("load-context", async () => {
      const { data: character } = await supabase
        .from("characters")
        .select("id, name, role, base_description, reference_image_urls")
        .eq("id", data.characterId)
        .single();
      if (!character) throw new Error(`Character ${data.characterId} not found`);

      const { data: project } = await supabase
        .from("projects")
        .select("scope, style_preset")
        .eq("id", data.projectId)
        .single();
      if (!project) throw new Error(`Project ${data.projectId} not found`);

      return { character, project };
    });

    const apiKey = await step.run("fetch-key", () =>
      getProviderKey(data.userId, "google_ai_studio"),
    );

    const refImages = await step.run("load-refs", async () => {
      const paths = (context.character.reference_image_urls ?? []) as string[];
      const loaded = [];
      for (const p of paths) {
        try {
          const ref = await downloadAsServiceBase64(p);
          loaded.push(ref);
        } catch (err) {
          console.warn(`Failed to load ref ${p}:`, err);
        }
      }
      return loaded;
    });

    const prompt = await step.run("build-prompt", () =>
      buildCharacterModelSheetPrompt({
        characterName: context.character.name,
        baseDescription: context.character.base_description,
        role: context.character.role,
        scope: context.project.scope,
        stylePreset: (context.project.style_preset ?? "cinematic_blockbuster") as StylePreset,
        hasReferenceImages: refImages.length > 0,
        editInstruction: data.editInstruction,
      }),
    );

    // Generate `variationCount` images in parallel via Inngest steps so retries are per-variation
    const variations = await Promise.all(
      Array.from({ length: variationCount }, (_, i) =>
        step.run(`generate-variation-${i}`, async () => {
          const result = await generateImage({ apiKey, prompt, referenceImages: refImages });
          const variationId = crypto.randomUUID();
          const path = `${data.userId}/${data.projectId}/characters/${data.characterId}/variations/${variationId}.png`;
          await uploadAsService(path, result.bytes, result.mimeType);
          return { variationId, path };
        }),
      ),
    );

    await step.run("persist", async () => {
      await supabase.from("character_variations").insert(
        variations.map((v) => ({
          id: v.variationId,
          character_id: data.characterId,
          image_url: v.path, // store path, not signed URL — sign on render
          prompt_used: prompt,
        })),
      );

      await supabase
        .from("jobs")
        .update({
          status: "succeeded",
          result: { variation_paths: variations.map((v) => v.path) },
        })
        .eq("id", data.jobId);
    });

    return { ok: true, variationsCreated: variations.length };
  },
);
