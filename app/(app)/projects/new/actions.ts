"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { ASPECT_RATIOS, STYLE_PRESETS } from "@/lib/providers/claude";
import { PRESET_PROFILES } from "@/lib/prompts/preset-profiles";
import type { ParseScriptEventData } from "@/lib/inngest/functions/parse-script";

const FormSchema = z.object({
  title: z.string().min(1, "Title required").max(200),
  scriptText: z.string().min(20, "Script must be at least 20 characters"),
  aspectRatio: z.enum(ASPECT_RATIOS),
  stylePreset: z.enum(STYLE_PRESETS),
  // Optional sub-mode for presets that have sub-modes (gameplay/animated). Validated
  // against the preset's allowed list further down.
  subMode: z.string().optional(),
  mustInclude: z.array(z.string()).default([]),
  mustNotInclude: z.array(z.string()).default([]),
});

type Result = { ok: true; projectId: string } | { ok: false; error: string };

export async function createProject(formData: FormData): Promise<Result> {
  const rawSubMode = formData.get("subMode");
  const raw = {
    title: String(formData.get("title") ?? ""),
    scriptText: String(formData.get("scriptText") ?? ""),
    aspectRatio: String(formData.get("aspectRatio") ?? ""),
    stylePreset: String(formData.get("stylePreset") ?? ""),
    subMode: rawSubMode ? String(rawSubMode) : undefined,
    mustInclude: parseList(formData.get("mustInclude")),
    mustNotInclude: parseList(formData.get("mustNotInclude")),
  };

  const parsed = FormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Resolve the sub-mode against the preset's profile. If the preset has sub-modes and
  // the user didn't pick one, use the default. If the user picked something invalid,
  // reject. If the preset has no sub-modes, ignore whatever was sent.
  const profile = PRESET_PROFILES[parsed.data.stylePreset];
  let resolvedSubMode: string | null = null;
  if (profile.subModes.length > 0) {
    const candidate = parsed.data.subMode || profile.defaultSubMode;
    if (!candidate) {
      return { ok: false, error: `Pick a sub-mode for ${parsed.data.stylePreset}.` };
    }
    if (!profile.subModes.some((m) => m.value === candidate)) {
      return { ok: false, error: `Invalid sub-mode "${candidate}" for ${parsed.data.stylePreset}.` };
    }
    resolvedSubMode = candidate;
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  // Verify Anthropic key exists before submitting (better UX than failing inside the worker)
  const service = createSupabaseServiceClient();
  const { data: keyRow } = await service
    .from("provider_credentials")
    .select("provider")
    .eq("user_id", userData.user.id)
    .eq("provider", "anthropic")
    .single();
  if (!keyRow) {
    return { ok: false, error: "Add an Anthropic API key at Settings → API Keys before creating a project." };
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .insert({
      user_id: userData.user.id,
      title: parsed.data.title,
      status: "intake",
      aspect_ratio: parsed.data.aspectRatio,
      style_preset: parsed.data.stylePreset,
      style_preset_options: resolvedSubMode ? { subMode: resolvedSubMode } : {},
      must_include: parsed.data.mustInclude,
      must_not_include: parsed.data.mustNotInclude,
    })
    .select("id")
    .single();

  if (projErr || !project) {
    return { ok: false, error: projErr?.message ?? "Failed to create project" };
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      project_id: project.id,
      user_id: userData.user.id,
      type: "parse_script",
      status: "queued",
      provider: "anthropic",
      request: {
        scriptLength: parsed.data.scriptText.length,
        aspectRatio: parsed.data.aspectRatio,
        stylePreset: parsed.data.stylePreset,
      },
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    return { ok: false, error: jobErr?.message ?? "Failed to enqueue job" };
  }

  const eventData: ParseScriptEventData = {
    jobId: job.id,
    projectId: project.id,
    userId: userData.user.id,
    scriptText: parsed.data.scriptText,
    title: parsed.data.title,
    aspectRatio: parsed.data.aspectRatio,
    stylePreset: parsed.data.stylePreset,
    subMode: resolvedSubMode,
    mustInclude: parsed.data.mustInclude,
    mustNotInclude: parsed.data.mustNotInclude,
  };

  await inngest.send({ name: "project/parse_script", data: eventData });
  return { ok: true, projectId: project.id };
}

function parseList(raw: FormDataEntryValue | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function redirectToBrief(projectId: string) {
  redirect(`/projects/${projectId}/brief`);
}
