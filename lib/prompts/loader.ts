import { readFile } from "node:fs/promises";
import path from "node:path";

const PROMPT_DIR = path.join(process.cwd(), "lib", "prompts", "trailer-builder");

let masterWorkflowCache: string | null = null;
const presetCache = new Map<string, string>();

export async function loadMasterWorkflow(): Promise<string> {
  if (masterWorkflowCache) return masterWorkflowCache;
  masterWorkflowCache = await readFile(
    path.join(PROMPT_DIR, "master_workflow.md"),
    "utf8",
  );
  return masterWorkflowCache;
}

export type StylePreset =
  | "cinematic_blockbuster"
  | "animated_film"
  | "videogame_gameplay"
  | "prerendered_cutscene";

export async function loadStylePreset(preset: StylePreset): Promise<string> {
  const cached = presetCache.get(preset);
  if (cached) return cached;
  const content = await readFile(
    path.join(PROMPT_DIR, "style_presets", `${preset}.md`),
    "utf8",
  );
  presetCache.set(preset, content);
  return content;
}
