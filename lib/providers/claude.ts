import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { loadMasterWorkflow, loadStylePreset, type StylePreset } from "@/lib/prompts/loader";
import {
  buildPresetCameraDirective,
  buildPresetMotionDirective,
} from "@/lib/prompts/preset-profiles";

export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const STYLE_PRESETS = [
  "cinematic_blockbuster",
  "animated_film",
  "videogame_gameplay",
  "prerendered_cutscene",
] as const;

export const ParsedScriptSchema = z.object({
  brief: z.object({
    scope: z
      .string()
      .describe("Era / installment / setting (e.g. 'modern-day Los Angeles', 'Halo: Combat Evolved')"),
    genre: z.string().describe("Genre tilt (action, horror, drama, etc.)"),
    emotional_arc: z
      .string()
      .describe("Emotional arc, e.g. 'wonder → mystery → horror → escape'"),
    suggested_runtime_seconds: z
      .number()
      .int()
      .describe("Suggested trailer runtime in seconds (60–180 typical)"),
    suggested_scene_count: z
      .number()
      .int()
      .describe("Suggested total scene count (18–25 for ~60s, 30–45 for ~2:30)"),
  }),
  characters: z
    .array(
      z.object({
        name: z.string().describe("Character name in snake_case for use as @reference"),
        role: z
          .string()
          .describe("Role in the story (protagonist, antagonist, ally, etc.)"),
        base_description: z
          .string()
          .describe(
            "Brief, reference-friendly description focused on identity, NOT detailed appearance — references will carry the visual fidelity",
          ),
      }),
    )
    .describe("Major characters extracted from the script"),
  scenes: z
    .array(
      z.object({
        scene_number: z.number().int().describe("Sequential scene number starting at 1"),
        act: z
          .string()
          .describe("Act label: act 1 / act 2 / act 3 / climax / title"),
        description: z
          .string()
          .describe("One-line scene summary, ~20 words max"),
      }),
    )
    .describe("Rough scene outline. propose_storyboard later flesh this out into the full table."),
});

export type ParsedScript = z.infer<typeof ParsedScriptSchema>;

interface ParseScriptArgs {
  apiKey: string;
  scriptText: string;
  title: string;
  aspectRatio: AspectRatio;
  stylePreset: StylePreset;
  /** Preset sub-mode (e.g. "third_person" for gameplay, "spider_verse" for animated). */
  subMode: string | null;
  mustInclude: string[];
  mustNotInclude: string[];
}

export async function parseScript({
  apiKey,
  scriptText,
  title,
  aspectRatio,
  stylePreset,
  subMode,
  mustInclude,
  mustNotInclude,
}: ParseScriptArgs): Promise<ParsedScript> {
  const masterWorkflow = await loadMasterWorkflow();
  const presetContent = await loadStylePreset(stylePreset);
  const presetDirective = buildPresetCameraDirective(stylePreset, subMode);

  const client = new Anthropic({ apiKey });

  // The preset directive goes FIRST in the system prompt — before the role definition —
  // so it overrides any default cinematic-film bias the model has. The preset .md content
  // is appended at the bottom as reinforcement.
  const system = `${presetDirective}

---

You are the planning brain for a trailer pipeline. The user has uploaded a finished script. Extract a deterministic, structured brief — derived facts about the story, the cast of characters, and a rough scene outline — that downstream steps will flesh out.

The project's rendering identity (above) is the source of truth for camera vocabulary. When extracting the rough scene outline, the action descriptions should imply framing consistent with that identity — do NOT describe scenes in cinematic-film language if the project is gameplay or animation.

You are operating under the rules of the trailer-builder workflow. Apply them — especially the anti-override guardrail (do NOT over-describe character appearances; trust references will be added later) and the frame strategy concepts (though full frame-role tagging happens in a later step).

# Master workflow rules (excerpted)

${masterWorkflow}

# Active style preset (additional context)

${presetContent}

# Your task

Given the script and the user's settings (aspect ratio, must-include / must-not-include), produce structured output matching the requested schema. Specifically:

- Derive the **scope** (era, installment, setting) from the script content — be specific.
- Derive the **genre** and **emotional_arc** from the actual narrative beats.
- Recommend a **runtime** appropriate for the script's density (60s teaser, 2:00 full, 2:30+ final).
- Recommend a **scene count** consistent with the runtime.
- Extract **characters** that appear in the script. Use snake_case for names. Keep base_description short and identity-focused — do NOT over-describe appearance (reference images will carry that). Include role.
- Produce a **scene outline** following the trailer structure (cold open → world establish → inciting threat → escalation → twist → climax → title). Number sequentially. One-line descriptions only.

Honor the must-include / must-not-include lists. If the script implies content that violates must-not-include, omit or rework it.`;

  const userMessage = `Title: ${title}
Aspect ratio: ${aspectRatio}
Style preset: ${stylePreset}
Must include: ${mustInclude.length ? mustInclude.join(", ") : "(none specified)"}
Must NOT include: ${mustNotInclude.length ? mustNotInclude.join(", ") : "(none specified)"}

# Script

${scriptText}`;

  const response = await client.messages.parse({
    model: "claude-opus-4-7",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: userMessage }],
    output_config: {
      format: zodOutputFormat(ParsedScriptSchema),
      effort: "high",
    },
  });

  if (!response.parsed_output) {
    throw new Error("Claude returned a response that failed schema validation.");
  }
  return response.parsed_output;
}

// =============================================================================
// propose_storyboard — flesh the rough scene outline from parse_script into the
// dense storyboard table per master_workflow.md Step 1
// =============================================================================

export const StoryboardSchema = z.object({
  scenes: z
    .array(
      z.object({
        scene_number: z.number().int().describe("Sequential scene number starting at 1"),
        act: z
          .string()
          .describe("Act label: act 1 / act 2 / act 3 / climax / title"),
        beat: z
          .string()
          .describe(
            "Short beat label (cold open, world establish, inciting threat, escalation, twist, tonal pivot, climax, title)",
          ),
        camera: z
          .string()
          .describe(
            "Camera angle / shot type (extreme close-up, low angle, wide, tracking, etc.). No two consecutive scenes share the same camera type.",
          ),
        frame_role: z
          .enum(["SINGLE", "PAIR-START", "PAIR-END"])
          .describe(
            "SINGLE = one image carries the clip. PAIR-START = anchor on start frame, edit forward to end. PAIR-END = anchor on end frame, edit backward to start.",
          ),
        anchor_direction: z
          .string()
          .nullable()
          .describe(
            "For PAIR scenes: 3-6 word rationale for the anchor choice (e.g. 'anchor end — figure is the money shot'). Null for SINGLE.",
          ),
        description: z
          .string()
          .describe(
            "One-line scene description, ~20 words max. Reference characters by name, no over-description (refs will carry the visual).",
          ),
      }),
    )
    .describe("Full storyboard."),
});

export type Storyboard = z.infer<typeof StoryboardSchema>;

interface ProposeStoryboardArgs {
  apiKey: string;
  briefYaml: string | null;
  scope: string | null;
  genre: string | null;
  emotionalArc: string | null;
  aspectRatio: AspectRatio;
  stylePreset: StylePreset;
  /** Preset sub-mode (e.g. "third_person" for gameplay). */
  subMode: string | null;
  mustInclude: string[];
  mustNotInclude: string[];
  characters: Array<{ name: string; role: string | null; base_description: string | null }>;
  existingScenes: Array<{ scene_number: number; act: string | null; description: string }>;
  targetSceneCount?: number;
}

export async function proposeStoryboard(args: ProposeStoryboardArgs): Promise<Storyboard> {
  const masterWorkflow = await loadMasterWorkflow();
  const presetContent = await loadStylePreset(args.stylePreset);
  const presetDirective = buildPresetCameraDirective(args.stylePreset, args.subMode);
  const client = new Anthropic({ apiKey: args.apiKey });

  const system = `${presetDirective}

---

You are the storyboard designer for this trailer. The brief and rough scene outline already exist; your job is to expand the outline into a dense, production-ready storyboard table per master_workflow.md Step 1.

The project's rendering identity (above) is non-negotiable. EVERY camera value you produce must come from the ALLOWED camera vocabulary list above. NONE may come from the FORBIDDEN list. If a scene's natural framing conflicts with the project's identity (e.g. a Dutch angle in a gameplay project), substitute it with the closest allowed equivalent.

Other critical rules:
- **Camera variety within the allowed vocabulary**: no two consecutive scenes share the same camera angle type — but variety draws from the project's allowed list, not generic film vocabulary.
- **Frame role distribution**: typically 30–50% pair scenes in action-heavy trailers, less in slower ones. Use SINGLE for ambient camera moves, simple atmospheric motion, contained single actions. Use PAIR-START when the change is additive (explosions, sparks, atmosphere). Use PAIR-END when the end frame is the money shot or the change is subtractive of a complex element.
- **Trailer structure**: hook within first 3 seconds (1.5s for vertical), follow the locked emotional arc, identify the existential twist / threat / climax / title moment.
- **Scope fidelity**: use must-include items, exclude must-not-include items.
- **Anti-over-description**: scene descriptions reference characters by name only. Do NOT describe character appearances — references handle that.
- **Aspect ratio fit**: tailor compositions to the locked aspect ratio (vertical = single-subject, foreground/background depth; horizontal = wider environmental scale).

# Master workflow rules

${masterWorkflow}

# Active style preset (additional context — reinforces but does not override the rendering identity above)

${presetContent}

# Your task

Given the brief, character list, and the rough scene outline, produce the full storyboard table. Use the rough outline as the spine — but you can refine, renumber, add, or merge scenes if the structure improves. Aim for the suggested scene count.

For each scene set ALL columns: scene_number, act, beat, camera, frame_role, anchor_direction (null for SINGLE), description.

Run the SELF-CHECK CHECKLIST before delivering:
- Camera angle variety (no consecutive duplicates)
- Frame strategy (defensible pair-anchor directions)
- Recurring motif chosen and appears across multiple acts
- Scope fidelity (no excluded elements)
- Pacing escalates, breathes, climaxes
- Aspect ratio compositions read correctly`;

  const userMessage = `# Brief

Scope: ${args.scope ?? "(unknown)"}
Genre: ${args.genre ?? "(unknown)"}
Emotional arc: ${args.emotionalArc ?? "(unknown)"}
Aspect ratio: ${args.aspectRatio}
Style preset: ${args.stylePreset}
Must include: ${args.mustInclude.length ? args.mustInclude.join(", ") : "(none)"}
Must NOT include: ${args.mustNotInclude.length ? args.mustNotInclude.join(", ") : "(none)"}
${args.targetSceneCount ? `Target scene count: ${args.targetSceneCount}` : ""}

# Locked brief YAML
${args.briefYaml ?? "(empty)"}

# Characters / assets in the project
${args.characters.map((c) => `- ${c.name}${c.role ? ` (${c.role})` : ""}${c.base_description ? ` — ${c.base_description}` : ""}`).join("\n")}

# Existing rough scene outline (refine or replace as needed)
${args.existingScenes.map((s) => `${s.scene_number}. [${s.act ?? "?"}] ${s.description}`).join("\n")}`;

  const response = await client.messages.parse({
    model: "claude-opus-4-7",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: userMessage }],
    output_config: {
      format: zodOutputFormat(StoryboardSchema),
      effort: "high",
    },
  });

  if (!response.parsed_output) {
    throw new Error("Storyboard generation returned no valid structured output.");
  }
  return response.parsed_output;
}

// ============ Motion prompt generation (Kling-optimal) ============

const MotionPromptsSchema = z.object({
  prompts: z
    .array(
      z.object({
        scene_number: z.number().int(),
        motion_prompt: z
          .string()
          .describe(
            "Kling-optimized motion prompt: 2-4 sentences, target 200-400 characters. Rich enough to give Kling sensory detail (lighting, atmosphere, sub-beats within the clip) but using simple syntax — short clauses, plain English, no markdown, no bullet points, no instructional language.",
          ),
      }),
    )
    .describe("One motion prompt per scene, in scene_number order"),
});

export type MotionPrompts = z.infer<typeof MotionPromptsSchema>;

interface GenerateMotionPromptsArgs {
  apiKey: string;
  stylePreset: StylePreset;
  /** Preset sub-mode (e.g. "third_person" for gameplay). */
  subMode: string | null;
  scopeName: string | null;
  genre: string | null;
  emotionalArc: string | null;
  briefYaml: string | null;
  characters: Array<{ name: string; role: string | null; base_description: string | null }>;
  scenes: Array<{
    scene_number: number;
    act: string | null;
    beat: string | null;
    camera: string | null;
    frame_role: string;
    anchor_direction: string | null;
    description: string;
  }>;
}

export async function generateMotionPrompts(args: GenerateMotionPromptsArgs): Promise<MotionPrompts> {
  const presetContent = await loadStylePreset(args.stylePreset);
  const presetCameraDirective = buildPresetCameraDirective(args.stylePreset, args.subMode);
  const presetMotionDirective = buildPresetMotionDirective(args.stylePreset, args.subMode);
  const client = new Anthropic({ apiKey: args.apiKey });

  // The preset camera + motion directives go FIRST — before generic Kling guidance —
  // so the project's identity overrides the model's default cinematic-film bias.
  const system = `${presetCameraDirective}

---

${presetMotionDirective}

---

You are a motion-prompt author for Kling — a state-of-the-art image-to-video model. The user has finished storyboarding still keyframes; your job is to write the **motion prompt** Kling uses to animate each keyframe into a 5-10 second clip.

The project's motion vocabulary above is non-negotiable. Every prompt's leading camera-move verb must come from the ALLOWED motion vocabulary list. NONE may come from the FORBIDDEN list. If your instinct is to write "anamorphic crane" but this is a gameplay project, write "behind-shoulder follow accelerates" instead.

# Kling prompting principles (non-negotiable)

1. **Lead with camera movement.** Kling responds best to motion verbs at the very start of the prompt. Use the project's ALLOWED motion vocabulary above — those are the verbs that match the project's identity. Generic film verbs are listed below as backup syntax reference but if the project forbids them, do NOT use them:
   - **Translation (cinematic)**: dolly in, dolly out, push in, pull out, truck left, truck right, crane up, crane down
   - **Rotation (cinematic)**: pan left, pan right, tilt up, tilt down, roll, orbit clockwise, orbit counter-clockwise
   - **Compound (cinematic)**: arc shot, whip pan, drone reveal, low-to-high crane, parallax dolly, rack focus
   - **Lens (cinematic)**: zoom in, zoom out, focus pull, anamorphic flare
   - **Gameplay**: lock-on snap, behind-shoulder follow, first-person bob, controller-look pan, controlled camera shake, gameplay zoom-in
   - **Animation**: snap zoom, exaggerated push-in, pose-to-pose snap, smear-frame motion
   - **Stillness (universal)**: locked-off, handheld micro-tremor, subtle drift
2. **Subject motion comes second, with sub-beats.** Don't just name one action — sequence it across the 5-10s clip. "Draws sword" is weak. "Hand trembles, then steadies, closes around the hilt — blade rings free, catches the light" is what makes Kling render a confident motion arc instead of a stiff one-note loop. Use commas and dashes to chain 2-4 beats inside the clip's runtime. Concrete verbs only ("hand grazes", "blade rings", "embers swirl", "cape billows", "eyes narrow") — never vague ones ("moves", "happens", "exists").
3. **Atmosphere is mandatory, not optional.** Every prompt must include at least one sensory atmospheric detail Kling can render: volumetric haze, dust motes, embers, rain streaks, lens flare, sun shafts, particles in the air, motion blur, depth-of-field shift, light catching X. These are the textures that elevate a Kling clip from "moves correctly" to "feels cinematic." Skipping atmosphere is the single biggest reason Kling output looks flat.
4. **Concise syntax, rich content.** Target 200-400 characters across 2-4 short sentences. The Kling docs say "the simpler the syntax structure, the better" — that's about syntax (short clauses, plain English, no markdown), NOT about being information-poor. A long sparse prompt fails; a tight detailed one wins. Do NOT pad with adjectives, but DO include the sensory beats Kling needs to render.
5. **End with a mood adjective.** A single closing word or phrase sets the emotional register Kling should aim for: "reverent", "frantic urgency", "cold dread", "weightless awe", "controlled menace". This is the "vibe channel" that makes the difference between a technically correct clip and one that lands the moment.
6. **No character descriptions.** The keyframe + bound element (if any) carry identity. Don't re-describe what the character looks like.
7. **No instructions to the model.** Write the scene as if narrating it, not as a prompt. ✅ "Slow push-in. Link's hand trembles, then steadies, closes around the Master Sword's hilt — blade rings free of the pedestal, catches the dawn light. Dust motes spiral in the shaft of gold. Reverent." ❌ "Generate a video where..."
8. **Frame-role awareness**:
   - **SINGLE**: full motion arc within the clip — beginning, middle, end of the moment
   - **PAIR-START**: setup motion only — anticipation, build, the calm before. End the prompt with where the energy is heading but don't deliver it. The PAIR-END frame will pay it off.
   - **PAIR-END**: climactic delivery — the explosion, the impact, the reveal happens. The clip should land the moment.
9. **Project identity is non-negotiable** — the rendering identity and motion vocabulary at the TOP of this prompt are the source of truth. Cinematic blockbuster wants ARRI-style anamorphic moves; videogame_gameplay wants in-engine camera (behind-shoulder follow / first-person bob / lock-on snap); animated_film wants expressive over-cranked motion. If the project is gameplay or animated, NEVER use cinematic film verbs in the motion prompt.
10. **Story coherence (non-negotiable)** — every motion prompt must serve the trailer's emotional arc and the scene's role in the larger structure. Random or generic animation breaks the trailer.
   - Read the locked brief, the emotional arc, and the recurring motif before writing any prompts. Identify the trailer's hook, escalation, climax, and resolution. Each scene's motion must reinforce its position in that arc.
   - **Pacing**: act 1 / opening = slower, contemplative motion (gentle drifts, slow push-ins, atmospheric stillness). Act 2 = building energy (faster cuts of motion, more aggressive camera moves). Climax = peak intensity (whip pans, hard impacts, rapid motion). Title / resolution = controlled stillness or final exhale.
   - **Recurring motif callbacks**: if the brief names a recurring visual motif (e.g. "raven flies past", "lens flare across protagonist's eye"), motion prompts in scenes that should carry the motif must reference it explicitly.
   - **Character coherence**: motion verbs should match each character's bearing (a stoic warrior moves with deliberate weight; a frantic survivor moves with jittery urgency). The character list below tells you who.
   - **Adjacent-scene awareness**: read the scene before and after each one. Don't repeat the same camera move twice in a row. Build motion contrast between consecutive scenes — kinetic followed by stillness, intimate followed by sweeping.

# Active style preset

${presetContent}

# Your task

Given the storyboarded scenes below, produce ONE Kling motion prompt for each. Output as a single JSON array (one entry per scene) in scene_number order. Each prompt should be a clean, standalone string ready to send to Kling — no preamble, no explanation, just the motion prompt itself.

Verify before responding — every prompt must satisfy ALL of:
- Leads with a camera movement verb (push-in, pan, dolly, crane, orbit, etc.)
- Sequences 2-4 sub-beats of subject motion across the clip's runtime (not a single static action)
- Includes at least one atmospheric/sensory detail Kling can render (haze, dust, embers, lens flare, light shaft, particles, motion blur, rack focus)
- Ends with a mood adjective or short phrase (the emotional register)
- Does NOT re-describe character appearance
- PAIR-START withholds the climax; PAIR-END delivers it
- Length 200-400 chars in 2-4 short sentences
- Reads as narration, not as a prompt

If any prompt feels generic or could apply to a different scene equally well, REWRITE IT before responding.`;

  const userMessage = `# Project context
Scope: ${args.scopeName ?? "(unspecified)"}
Genre: ${args.genre ?? "(unspecified)"}
Emotional arc: ${args.emotionalArc ?? "(unspecified)"}
Style preset: ${args.stylePreset}

# Locked brief (full story bible)
${args.briefYaml ?? "(no brief on file)"}

# Characters in the project (motion vocabulary should match each character's bearing)
${
  args.characters.length
    ? args.characters
        .map(
          (c) =>
            `- ${c.name}${c.role ? ` (${c.role})` : ""}${c.base_description ? ` — ${c.base_description}` : ""}`,
        )
        .join("\n")
    : "(no characters on file)"
}

# Scenes (${args.scenes.length}) — full sequence, in order
${args.scenes
  .map(
    (s) =>
      `${s.scene_number}. [${s.act ?? "?"} · ${s.frame_role}${s.anchor_direction ? ` · ${s.anchor_direction}` : ""}]
   Camera: ${s.camera ?? "(unspecified)"}
   Beat: ${s.beat ?? "(unspecified)"}
   Action: ${s.description}`,
  )
  .join("\n\n")}

# Final reminder
Before writing each prompt, ask yourself:
- What is THIS scene's role in the trailer's arc (hook / setup / escalation / climax / resolution)?
- How does its motion contrast with the scenes immediately before and after?
- Does the recurring motif (if any) belong in this scene?
- Is the camera move appropriate for the act-level energy, not just the literal action?

Write motion prompts that feel inevitable for this story, not generic.`;

  const response = await client.messages.parse({
    model: "claude-opus-4-7",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: userMessage }],
    output_config: {
      format: zodOutputFormat(MotionPromptsSchema),
      effort: "high",
    },
  });

  if (!response.parsed_output) {
    throw new Error("Motion prompt generation returned no valid structured output.");
  }
  return response.parsed_output;
}
