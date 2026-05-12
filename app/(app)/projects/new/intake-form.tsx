"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createProject } from "./actions";
import { PRESET_PROFILES } from "@/lib/prompts/preset-profiles";
import type { StylePreset } from "@/lib/prompts/loader";

const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9 — YouTube / theatrical" },
  { value: "9:16", label: "9:16 — TikTok / Reels / Shorts" },
  { value: "1:1", label: "1:1 — Square feed" },
  { value: "4:5", label: "4:5 — Portrait feed" },
] as const;

const STYLE_PRESETS: { value: StylePreset; label: string }[] = [
  { value: "cinematic_blockbuster", label: "Cinematic blockbuster (live action)" },
  { value: "animated_film", label: "Animated film (Pixar / anime / Spider-Verse)" },
  { value: "videogame_gameplay", label: "Video game gameplay (in-engine)" },
  { value: "prerendered_cutscene", label: "Pre-rendered cutscene (game cinematic)" },
];

export function IntakeForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [scriptText, setScriptText] = useState("");
  const [stylePreset, setStylePreset] = useState<StylePreset>("cinematic_blockbuster");
  const presetProfile = PRESET_PROFILES[stylePreset];
  const [subMode, setSubMode] = useState<string>(presetProfile.defaultSubMode ?? "");

  function handlePresetChange(next: StylePreset) {
    setStylePreset(next);
    setSubMode(PRESET_PROFILES[next].defaultSubMode ?? "");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createProject(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(`/projects/${result.projectId}/brief`);
    });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setScriptText(text);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">Project title</Label>
        <Input id="title" name="title" required placeholder="e.g. Halo: Combat Evolved trailer" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="scriptText">Script</Label>
        <p className="text-xs text-[var(--muted)]">
          Paste your script or upload a .txt / .md file. The AI extracts characters and scene outline from this.
        </p>
        <input
          type="file"
          accept=".txt,.md,.fountain"
          onChange={handleFileUpload}
          className="block text-xs text-[var(--muted)] file:mr-3 file:rounded file:border file:border-[var(--border)] file:bg-[var(--surface-2)] file:px-3 file:py-1.5 file:text-foreground hover:file:bg-zinc-800"
        />
        <Textarea
          id="scriptText"
          name="scriptText"
          required
          rows={14}
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          placeholder="INT. WAREHOUSE — NIGHT&#10;&#10;Lily steps into a beam of moonlight, her hand trembling..."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="aspectRatio">Aspect ratio</Label>
          <Select id="aspectRatio" name="aspectRatio" defaultValue="16:9">
            {ASPECT_RATIOS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="stylePreset">Style preset</Label>
          <Select
            id="stylePreset"
            name="stylePreset"
            value={stylePreset}
            onChange={(e) => handlePresetChange(e.target.value as StylePreset)}
          >
            {STYLE_PRESETS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {presetProfile.subModes.length > 0 && (
        <div className="space-y-2 rounded border border-amber-500/30 bg-amber-500/5 p-3">
          <Label htmlFor="subMode">
            {stylePreset === "videogame_gameplay" ? "Camera perspective" : "Animation sub-style"}
          </Label>
          <p className="text-xs text-[var(--muted)]">
            {stylePreset === "videogame_gameplay"
              ? "How the gameplay camera frames the action. Drives every scene's camera language."
              : "Which animation tradition the trailer should evoke. Drives rendering and motion language."}
          </p>
          <Select
            id="subMode"
            name="subMode"
            value={subMode}
            onChange={(e) => setSubMode(e.target.value)}
          >
            {presetProfile.subModes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <p className="text-[11px] italic text-[var(--muted)]">
            {presetProfile.subModes.find((m) => m.value === subMode)?.cameraNotes}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="mustInclude">Must include</Label>
        <p className="text-xs text-[var(--muted)]">
          Iconic moments, characters, locations that have to appear. Comma- or newline-separated.
        </p>
        <Textarea id="mustInclude" name="mustInclude" rows={2} placeholder="Master Sword reveal, Hyrule Castle wide shot" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mustNotInclude">Must NOT include</Label>
        <p className="text-xs text-[var(--muted)]">
          Era-specific elements, characters, or aesthetics that would break scope.
        </p>
        <Textarea id="mustNotInclude" name="mustNotInclude" rows={2} placeholder="BotW visual style, Sheikah tech, modern architecture" />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create project & parse script"}
        </Button>
      </div>
    </form>
  );
}
