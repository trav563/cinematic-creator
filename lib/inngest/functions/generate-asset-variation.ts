import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getProviderKey } from "@/lib/providers/keys";
import { generateImage } from "@/lib/providers/gemini";
import { downloadAsServiceBase64, uploadAsService } from "@/lib/storage";
import {
  buildAssetModelSheetPrompt,
  type AssetKind,
} from "@/lib/prompts/asset-prompts";
import type { StylePreset } from "@/lib/prompts/loader";

export interface GenerateAssetVariationEventData {
  jobId: string;
  projectId: string;
  assetId: string;
  userId: string;
  editInstruction?: string;
  variationCount?: number; // default 3
}

export const generateAssetVariationFunction = inngest.createFunction(
  {
    id: "generate-asset-variation",
    name: "Generate asset model-sheet variations",
    triggers: [{ event: "asset/generate_variation" }],
    retries: 1,
    // Each asset run makes 3 parallel Gemini calls. Cap concurrent assets at 3
    // so "Generate all" with 10+ assets can't fan out to 30+ concurrent Gemini
    // calls + storage downloads, which previously overwhelmed Supabase connections.
    concurrency: { limit: 3 },
  },
  async ({ event, step }) => {
    const data = event.data as GenerateAssetVariationEventData;
    const variationCount = data.variationCount ?? 3;
    const supabase = createSupabaseServiceClient();

    await step.run("mark-running", async () => {
      await supabase.from("jobs").update({ status: "running" }).eq("id", data.jobId);
    });

    const context = await step.run("load-context", async () => {
      const { data: asset } = await supabase
        .from("assets")
        .select("id, name, kind, role, base_description, reference_image_urls")
        .eq("id", data.assetId)
        .single();
      if (!asset) throw new Error(`Asset ${data.assetId} not found`);

      const { data: project } = await supabase
        .from("projects")
        .select("scope, style_preset")
        .eq("id", data.projectId)
        .single();
      if (!project) throw new Error(`Project ${data.projectId} not found`);

      return { asset, project };
    });

    const apiKey = await step.run("fetch-key", () =>
      getProviderKey(data.userId, "google_ai_studio"),
    );

    const refImages = await step.run("load-refs", async () => {
      const paths = (context.asset.reference_image_urls ?? []) as string[];
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
      buildAssetModelSheetPrompt({
        assetName: context.asset.name,
        baseDescription: context.asset.base_description,
        role: context.asset.role,
        kind: (context.asset.kind ?? null) as AssetKind | null,
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
          const path = `${data.userId}/${data.projectId}/assets/${data.assetId}/variations/${variationId}.png`;
          await uploadAsService(path, result.bytes, result.mimeType);
          return { variationId, path };
        }),
      ),
    );

    await step.run("persist", async () => {
      await supabase.from("asset_variations").insert(
        variations.map((v) => ({
          id: v.variationId,
          asset_id: data.assetId,
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
