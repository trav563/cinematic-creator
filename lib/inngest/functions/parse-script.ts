import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getProviderKey } from "@/lib/providers/keys";
import {
  parseScript,
  type AspectRatio,
  ParsedScriptSchema,
} from "@/lib/providers/claude";
import type { StylePreset } from "@/lib/prompts/loader";

export interface ParseScriptEventData {
  jobId: string;
  projectId: string;
  userId: string;
  scriptText: string;
  title: string;
  aspectRatio: AspectRatio;
  stylePreset: StylePreset;
  /** Preset sub-mode (e.g. "third_person" for gameplay). Null when preset has no sub-modes. */
  subMode: string | null;
  mustInclude: string[];
  mustNotInclude: string[];
}

export const parseScriptFunction = inngest.createFunction(
  {
    id: "parse-script",
    name: "Parse script into derived brief",
    triggers: [{ event: "project/parse_script" }],
    retries: 1,
  },
  async ({ event, step }) => {
    const data = event.data as ParseScriptEventData;
    const supabase = createSupabaseServiceClient();

    await step.run("mark-running", async () => {
      await supabase.from("jobs").update({ status: "running" }).eq("id", data.jobId);
    });

    const apiKey = await step.run("fetch-key", () =>
      getProviderKey(data.userId, "anthropic"),
    );

    const parsed = await step.run("call-claude", async () => {
      const result = await parseScript({
        apiKey,
        scriptText: data.scriptText,
        title: data.title,
        aspectRatio: data.aspectRatio,
        stylePreset: data.stylePreset,
        subMode: data.subMode,
        mustInclude: data.mustInclude,
        mustNotInclude: data.mustNotInclude,
      });
      // Belt-and-suspenders: re-validate before persisting.
      return ParsedScriptSchema.parse(result);
    });

    await step.run("persist", async () => {
      // 1. Update project with derived brief fields
      const briefYaml = buildBriefYaml(data, parsed);
      await supabase
        .from("projects")
        .update({
          brief_yaml: briefYaml,
          scope: parsed.brief.scope,
          genre: parsed.brief.genre,
          emotional_arc: parsed.brief.emotional_arc,
          status: "brief_review",
        })
        .eq("id", data.projectId);

      // 2. Insert characters
      if (parsed.characters.length > 0) {
        await supabase.from("characters").insert(
          parsed.characters.map((c) => ({
            project_id: data.projectId,
            name: c.name,
            role: c.role,
            base_description: c.base_description,
          })),
        );
      }

      // 3. Insert scenes (rough outline — propose_storyboard fills cameras and frame roles later)
      if (parsed.scenes.length > 0) {
        await supabase.from("scenes").insert(
          parsed.scenes.map((s) => ({
            project_id: data.projectId,
            scene_number: s.scene_number,
            act: s.act,
            description: s.description,
            frame_role: "SINGLE", // placeholder — propose_storyboard sets the real value
            status: "planned",
          })),
        );
      }

      // 4. Mark job succeeded with the parsed payload
      await supabase
        .from("jobs")
        .update({ status: "succeeded", result: parsed })
        .eq("id", data.jobId);
    });

    return { ok: true, characters: parsed.characters.length, scenes: parsed.scenes.length };
  },
);

function buildBriefYaml(input: ParseScriptEventData, parsed: ReturnType<typeof ParsedScriptSchema.parse>): string {
  // Mirrors the locked-brief YAML shape from the trailer-builder skill.
  const list = (arr: string[]) =>
    arr.length === 0 ? "[]" : `\n${arr.map((s) => `  - "${s.replace(/"/g, '\\"')}"`).join("\n")}`;

  return `---
title: "${input.title.replace(/"/g, '\\"')}"
scope: "${parsed.brief.scope.replace(/"/g, '\\"')}"
style_preset: ${input.stylePreset}
aspect_ratio: "${input.aspectRatio}"
genre: "${parsed.brief.genre.replace(/"/g, '\\"')}"
emotional_arc: "${parsed.brief.emotional_arc.replace(/"/g, '\\"')}"
suggested_runtime_seconds: ${parsed.brief.suggested_runtime_seconds}
suggested_scene_count: ${parsed.brief.suggested_scene_count}
must_include:${list(input.mustInclude)}
must_not_include:${list(input.mustNotInclude)}
---

## Notes

Derived automatically by parse_script. Edit any field above before locking the brief.
`;
}
