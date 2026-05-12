import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getProviderKey } from "@/lib/providers/keys";
import { submitCreateElement, pollElementTask } from "@/lib/providers/kling";
import { downloadAsServiceBase64 } from "@/lib/storage";

export interface BindCharacterElementEventData {
  jobId: string;
  projectId: string;
  characterId: string;
  userId: string;
}

const POLL_INTERVAL_SECONDS = 10;
const MAX_POLLS = 18; // 18 × 10s = 3 minutes; element creation is faster than video gen

export const bindCharacterElementFunction = inngest.createFunction(
  {
    id: "bind-character-element",
    name: "Bind character to Kling element",
    triggers: [{ event: "character/bind_kling_element" }],
    retries: 1,
    concurrency: { limit: 3 },
    onFailure: async ({ event, error }) => {
      const original = (event.data as { event: { data: BindCharacterElementEventData } }).event;
      const supabase = createSupabaseServiceClient();
      await supabase
        .from("jobs")
        .update({ status: "failed", error: error.message ?? "unknown error" })
        .eq("id", original.data.jobId);
      await supabase
        .from("characters")
        .update({ kling_element_status: "failed" })
        .eq("id", original.data.characterId);
    },
  },
  async ({ event, step }) => {
    const data = event.data as BindCharacterElementEventData;
    const supabase = createSupabaseServiceClient();

    await step.run("mark-running", async () => {
      await supabase.from("jobs").update({ status: "running" }).eq("id", data.jobId);
      await supabase
        .from("characters")
        .update({ kling_element_status: "binding" })
        .eq("id", data.characterId);
    });

    const ctx = await step.run("load-context", async () => {
      const { data: character } = await supabase
        .from("characters")
        .select("name, base_description, confirmed_variation_id")
        .eq("id", data.characterId)
        .single();
      if (!character) throw new Error("Character not found");
      if (!character.confirmed_variation_id) {
        throw new Error("Character has no confirmed variation. Confirm one first.");
      }

      const { data: variation } = await supabase
        .from("character_variations")
        .select("image_url")
        .eq("id", character.confirmed_variation_id)
        .single();
      if (!variation) throw new Error("Confirmed variation not found in storage");

      return {
        name: character.name,
        description: character.base_description ?? character.name,
        imagePath: variation.image_url,
      };
    });

    const credential = await step.run("fetch-key", () =>
      getProviderKey(data.userId, "kling"),
    );

    const frontalImageBase64 = await step.run("load-image", async () => {
      const { base64 } = await downloadAsServiceBase64(ctx.imagePath);
      return base64;
    });

    const taskId = await step.run("submit-element", () =>
      submitCreateElement({
        credential,
        elementName: ctx.name,
        elementDescription: ctx.description,
        frontalImageBase64,
      }),
    );

    let elementId: string | null = null;
    for (let i = 0; i < MAX_POLLS; i++) {
      await step.sleep(`wait-${i}`, `${POLL_INTERVAL_SECONDS}s`);
      const status = await step.run(`poll-${i}`, () => pollElementTask(credential, taskId));
      if (status.status === "succeed" && status.elementId) {
        elementId = status.elementId;
        break;
      }
      if (status.status === "failed") {
        throw new Error(`Kling element creation failed: ${status.error ?? "unknown"}`);
      }
    }
    if (!elementId) {
      throw new Error(`Kling element task did not complete within ${MAX_POLLS * POLL_INTERVAL_SECONDS}s.`);
    }

    await step.run("persist", async () => {
      await supabase
        .from("characters")
        .update({
          kling_element_id: elementId,
          kling_element_status: "bound",
        })
        .eq("id", data.characterId);

      await supabase
        .from("jobs")
        .update({
          status: "succeeded",
          result: { kling_element_id: elementId, kling_task_id: taskId },
        })
        .eq("id", data.jobId);
    });

    return { ok: true, elementId };
  },
);
