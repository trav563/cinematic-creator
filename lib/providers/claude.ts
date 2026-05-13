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
  assets: z
    .array(
      z.object({
        name: z.string().describe("Asset name in snake_case (used verbatim in scene descriptions for matching)"),
        kind: z
          .enum(["character", "location", "object"])
          .describe(
            "character = a person / hero / villain / NPC. location = a named recurring setting (kokiri_village, hyrule_castle). object = a key prop or named item (master_sword, hover_boots, ocarina_of_time). Only extract assets that recur across multiple scenes OR are central to the trailer's identity.",
          ),
        role: z
          .string()
          .describe(
            "Role / function in the story. For characters: protagonist / antagonist / ally / mentor. For locations: hub world / dungeon / climactic battleground. For objects: key item / weapon / artifact.",
          ),
        base_description: z
          .string()
          .describe(
            "Brief, reference-friendly description focused on identity, NOT detailed appearance — references will carry the visual fidelity",
          ),
      }),
    )
    .describe(
      "Recurring assets extracted from the script: characters, named locations, and key objects/props. Each gets its own model-sheet workflow so scene generations have consistent references.",
    ),
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

You are the planning brain for a trailer pipeline. The user has uploaded a finished script. Extract a deterministic, structured brief — derived facts about the story, the **assets** (characters, locations, and key objects), and a rough scene outline — that downstream steps will flesh out.

The project's rendering identity (above) is the source of truth for camera vocabulary. When extracting the rough scene outline, the action descriptions should imply framing consistent with that identity — do NOT describe scenes in cinematic-film language if the project is gameplay or animation.

You are operating under the rules of the trailer-builder workflow. Apply them — especially the anti-override guardrail (do NOT over-describe character appearances; trust references will be added later) and the frame strategy concepts (though full frame-role tagging happens in a later step).

## Asset extraction (critical)

Extract not just **characters**, but also **named locations** and **key objects** that recur across multiple scenes or are central to the trailer's identity. Each asset gets its own model-sheet workflow so scene generations have consistent references.

- **Characters**: protagonists, antagonists, named allies, recurring NPCs. snake_case names. Examples: \`young_link\`, \`princess_zelda\`, \`ganondorf\`, \`navi\`.
- **Locations**: named recurring settings or iconic environments. snake_case names. Examples: \`kokiri_village\`, \`hyrule_castle_courtyard\`, \`temple_of_time\`, \`death_mountain_summit\`. Don't extract one-off generic settings like "the forest" or "a hallway".
- **Objects**: key props, named items, or signature gear. snake_case names. Examples: \`master_sword\`, \`ocarina_of_time\`, \`hover_boots\`, \`master_chief_helmet\`. Don't extract generic items like "a sword" or "a door".

Aim for 3-12 assets total per project. Quality over quantity — every asset will need reference images uploaded by the user, so only extract things that warrant the work.

When you write the rough scene outline, **reference assets by their snake_case name verbatim** in the description (e.g. "young_link wakes in kokiri_village, navi hovers nearby"). The downstream keyframe generator matches these names against the asset library to pull in the right references.

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
- Extract **assets** (characters, locations, key objects) per the asset extraction rules above. Use snake_case for names. Keep base_description short and identity-focused — do NOT over-describe appearance (reference images will carry that). Include role + kind.
- Produce a **scene outline** following the trailer structure (cold open → world establish → inciting threat → escalation → twist → climax → title). Number sequentially. One-line descriptions only.

Honor the must-include / must-not-include lists. If the script implies content that violates must-not-include, omit or rework it.`;

  const userMessage = `Title: ${title}
Aspect ratio: ${aspectRatio}
Style preset: ${stylePreset}
Must include: ${mustInclude.length ? mustInclude.join(", ") : "(none specified)"}
Must NOT include: ${mustNotInclude.length ? mustNotInclude.join(", ") : "(none specified)"}

# Script

${scriptText}`;

  const response = await client.messages
    .stream({
      model: "claude-opus-4-7",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: userMessage }],
      output_config: {
        format: zodOutputFormat(ParsedScriptSchema),
        effort: "high",
      },
    })
    .finalMessage();

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
          .enum(["SINGLE", "PAIR"])
          .describe(
            "SINGLE = one keyframe carries the clip (camera move, simple atmospheric motion, contained action). PAIR = the clip needs two keyframes (start frame and end frame) because the visual change is significant — explosion, transformation, reveal, impact, character entrance.",
          ),
        pair_anchor: z
          .enum(["start", "end"])
          .nullable()
          .describe(
            "For PAIR scenes only: which side is the anchor frame (the side we generate first; the other is editorially derived). 'end' when the end frame is the money shot or the change is additive (explosion, sparks, transformation). 'start' when the start frame is the cleaner reference and the change is subtractive or progressive (smoke clears, character enters frame, impact happens). NULL for SINGLE scenes.",
          ),
        anchor_direction: z
          .string()
          .nullable()
          .describe(
            "For PAIR scenes: 3-6 word rationale for the anchor choice (e.g. 'anchor end — explosion is the money shot'). Null for SINGLE.",
          ),
        description: z
          .string()
          .describe(
            "One-line scene description, ~20 words max. Reference assets (characters, locations, objects) by their snake_case name verbatim — the keyframe matcher uses these names to attach the right reference images. For PAIR scenes, describe the BOTH the start and end states in the same sentence (e.g. 'young_link draws master_sword from pedestal — beam of light erupts, dust scatters' implies anchor=end with a clean before-state). No over-description of asset appearances (refs carry the visual).",
          ),
        motion_prompt: z
          .string()
          .describe(
            "Kling-optimized motion prompt that animates this scene's keyframe into a 5-10s clip. 200-400 characters in 2-4 short sentences. MUST: (1) lead with a camera-movement verb from the project's ALLOWED motion vocabulary (NEVER from the FORBIDDEN list); (2) sequence 2-4 sub-beats of subject motion (concrete verbs like 'hand grazes', 'embers swirl' — no vague 'moves'); (3) include at least one atmospheric/sensory detail Kling can render (haze, dust, embers, lens flare, sun shafts, motion blur, particles); (4) end with a mood adjective or short phrase ('reverent', 'cold dread', 'frantic urgency'); (5) read as narration, NOT as an instruction to a model; (6) NOT re-describe character appearance — the keyframe carries identity. Frame-role awareness: SINGLE = full motion arc, PAIR = describes the full transition (start anticipation through end payoff) since one Kling clip animates the whole scene.",
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
  /** All assets (characters, locations, objects) extracted by parse_script. */
  assets: Array<{
    name: string;
    kind: "character" | "location" | "object";
    role: string | null;
    base_description: string | null;
  }>;
  existingScenes: Array<{ scene_number: number; act: string | null; description: string }>;
  targetSceneCount?: number;
}

export async function proposeStoryboard(args: ProposeStoryboardArgs): Promise<Storyboard> {
  const masterWorkflow = await loadMasterWorkflow();
  const presetContent = await loadStylePreset(args.stylePreset);
  const presetDirective = buildPresetCameraDirective(args.stylePreset, args.subMode);
  const presetMotionDirective = buildPresetMotionDirective(args.stylePreset, args.subMode);
  const client = new Anthropic({ apiKey: args.apiKey });

  const system = `${presetDirective}

---

${presetMotionDirective}

---

You are the storyboard designer for this trailer. The brief and rough scene outline already exist; your job is to expand the outline into a dense, production-ready storyboard table per master_workflow.md Step 1, AND to author the per-scene Kling motion prompt that will animate each keyframe.

The project's rendering identity (above) is non-negotiable. EVERY camera value you produce must come from the ALLOWED camera vocabulary list above. NONE may come from the FORBIDDEN list. If a scene's natural framing conflicts with the project's identity (e.g. a Dutch angle in a gameplay project), substitute it with the closest allowed equivalent.

Other critical rules:
- **Camera variety within the allowed vocabulary**: no two consecutive scenes share the same camera angle type — but variety draws from the project's allowed list, not generic film vocabulary.
- **Frame role**: choose SINGLE or PAIR per scene. SINGLE = the scene's clip can be carried by one keyframe + Kling motion (camera pushes, atmospheric motion, contained single actions). PAIR = the visual change between start and end is significant enough that one keyframe can't carry it: explosions, transformations, character entrances/exits, weapon swings landing, reveals, impacts, transitions between cleanly distinct visual states. Aim for ~30-50% PAIR scenes in action-heavy trailers, less in slower contemplative ones.
- **Pair anchor direction**: for every PAIR scene, set \`pair_anchor\` to either "end" (when the end frame is the money shot — explosion, sword raised in victory, character transformed) or "start" (when the start frame is the cleaner reference and we morph forward — figure walks into frame, smoke clears, weapon draws). The anchor is what we generate first; the other side is editorially derived from it via Gemini's image edit endpoint.
- **One scene per clip**: each row in the output is ONE Kling-generated clip. Do NOT split a single conceptual shot into separate PAIR-START and PAIR-END rows — that's the old model. A "swing of the sword that catches sunlight" is ONE PAIR scene with anchor=end and a description spanning both states.
- **Trailer structure**: hook within first 3 seconds (1.5s for vertical), follow the locked emotional arc, identify the existential twist / threat / climax / title moment.
- **Scope fidelity**: use must-include items, exclude must-not-include items.
- **Asset names verbatim**: scene descriptions reference assets (characters, locations, objects) by their snake_case name verbatim — the keyframe matcher uses these names to attach the right reference images. Do NOT describe asset appearances — references handle that.
- **Aspect ratio fit**: tailor compositions to the locked aspect ratio (vertical = single-subject, foreground/background depth; horizontal = wider environmental scale).

# Master workflow rules

${masterWorkflow}

# Active style preset (additional context — reinforces but does not override the rendering identity above)

${presetContent}

# Your task

Given the brief, asset list, and the rough scene outline, produce the full storyboard table. Use the rough outline as the spine — but you can refine, renumber, add, or merge scenes if the structure improves. Aim for the suggested scene count (each row = one Kling clip).

For each scene set ALL columns: scene_number, act, beat, camera, frame_role (SINGLE or PAIR), pair_anchor (start/end for PAIR, null for SINGLE), anchor_direction (rationale for PAIR, null for SINGLE), description, motion_prompt.

# Motion prompt authoring (Kling-optimal)

In addition to the storyboard columns, you must write the **motion_prompt** for every scene. This is the prompt Kling uses to animate the still keyframe into a 5-10s clip. The prompt is non-trivial — bad prompts produce flat, generic motion. Apply ALL of the following principles:

1. **Lead with camera movement.** Kling responds best to motion verbs at the very start. Use the project's ALLOWED motion vocabulary (above) — these are the verbs that match the project's identity. NEVER use a verb from the FORBIDDEN list.
2. **Subject motion comes second, with sub-beats.** Sequence 2-4 concrete beats across the clip. "Hand grazes the hilt — fingers tighten — blade rings free, catches the dawn light" is what gives Kling a confident motion arc instead of a stiff one-note loop. Concrete verbs only ("hand trembles", "embers swirl", "cape billows"); never vague ones ("moves", "happens").
3. **Atmosphere is mandatory.** Every prompt must include at least one sensory atmospheric detail Kling can render: volumetric haze, dust motes, embers, rain streaks, lens flare, sun shafts, particles, motion blur, depth-of-field shift. Skipping atmosphere is the #1 reason Kling output looks flat.
4. **Concise syntax, rich content.** 200-400 characters in 2-4 short sentences. Plain English, no markdown, no instructional fluff. Tight + detailed wins; long + sparse fails.
5. **End with a mood adjective.** "Reverent." "Frantic urgency." "Cold dread." "Weightless awe." This sets Kling's emotional register.
6. **No character descriptions.** The keyframe + bound element carry identity. Don't re-describe what the character looks like.
7. **Read as narration, not as an instruction.** ✅ "Slow push-in. Link's hand trembles, then steadies, closes around the hilt — blade rings free, catches the dawn light. Dust motes spiral in the gold shaft. Reverent." ❌ "Generate a video where..."
8. **Story coherence.** Pacing follows the trailer arc — act 1 = slower contemplative motion, act 2 = building energy, climax = peak intensity, title/resolution = controlled stillness or final exhale. Recurring motifs (if any) should appear in the motion prompts of scenes that should carry them. Adjacent scenes should contrast — don't repeat the same camera move twice in a row.
9. **PAIR scenes**: since the storyboard now models a PAIR as ONE Kling clip animating both keyframes, the motion prompt should describe the full transition from anchor to derived state — anticipation through payoff. Use the anchor_direction to guide the energy flow.

Run the SELF-CHECK CHECKLIST before delivering:
- Camera angle variety (no consecutive duplicates)
- Frame strategy (every PAIR has a defensible anchor + clear before/after described)
- Recurring motif chosen and appears across multiple acts
- Scope fidelity (no excluded elements)
- Pacing escalates, breathes, climaxes
- Aspect ratio compositions read correctly
- All asset references in descriptions use snake_case names from the asset list
- Every scene has a motion_prompt that meets ALL the principles above (camera-verb lead, 2-4 sub-beats, atmospheric detail, mood-adjective ending, narration tone, no character re-description, 200-400 chars)`;

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

# Assets in the project (use these snake_case names verbatim in scene descriptions)
${args.assets.map((a) => `- ${a.name} [${a.kind}]${a.role ? ` (${a.role})` : ""}${a.base_description ? ` — ${a.base_description}` : ""}`).join("\n")}

# Existing rough scene outline (refine or replace as needed)
${args.existingScenes.map((s) => `${s.scene_number}. [${s.act ?? "?"}] ${s.description}`).join("\n")}`;

  const response = await client.messages
    .stream({
      model: "claude-opus-4-7",
      max_tokens: 24000,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: userMessage }],
      output_config: {
        format: zodOutputFormat(StoryboardSchema),
        effort: "high",
      },
    })
    .finalMessage();

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

  const response = await client.messages
    .stream({
      model: "claude-opus-4-7",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: userMessage }],
      output_config: {
        format: zodOutputFormat(MotionPromptsSchema),
        effort: "high",
      },
    })
    .finalMessage();

  if (!response.parsed_output) {
    throw new Error("Motion prompt generation returned no valid structured output.");
  }
  return response.parsed_output;
}

// ============ Paired-frame edit instruction composition ============

const PairedFrameEditSchema = z.object({
  edit_instruction: z
    .string()
    .describe(
      "Natural-language edit instruction to send to Gemini's image edit endpoint. Tells the model what to add / remove / transform from the source keyframe to produce the paired frame. Concrete, specific, ≤300 chars.",
    ),
});

interface ComposePairedFrameEditArgs {
  apiKey: string;
  /** The whole scene description from the storyboard — describes both start and end states. */
  sceneDescription: string;
  /** Which side of the pair was generated as the anchor. We're now deriving the OTHER side. */
  pairAnchor: "start" | "end";
  /** Storyboard's brief rationale for the anchor choice. */
  anchorDirection: string | null;
  /** Camera, beat, act for context. */
  camera: string | null;
  beat: string | null;
  act: string | null;
  /** Asset names referenced in this scene (so the instruction can name them). */
  referencedAssetNames: string[];
}

/**
 * Compose the Gemini image-edit instruction that transforms the anchor frame into
 * its paired counterpart. The instruction is concrete and surgical — name what to
 * add/remove/transform and explicitly state what should stay identical.
 */
export async function composePairedFrameEditInstruction(
  args: ComposePairedFrameEditArgs,
): Promise<string> {
  const client = new Anthropic({ apiKey: args.apiKey });

  const target = args.pairAnchor === "start" ? "END" : "START";
  const direction =
    args.pairAnchor === "start"
      ? "FORWARD in time (the anchor frame is the BEFORE state; you're describing what the scene looks like AFTER the moment lands — explosions visible, character moved, transformation complete)"
      : "BACKWARD in time (the anchor frame is the AFTER state — the money shot. You're describing what the scene looked like BEFORE the moment landed — explosions removed, character in setup pose, transformation undone)";

  const system = `You are composing a Gemini image-edit instruction. The user has a keyframe representing the ${args.pairAnchor.toUpperCase()} side of a paired Kling clip. You are telling Gemini how to transform that anchor into the ${target} side.

You are working ${direction}.

# What makes a good edit instruction

1. **Concrete, surgical changes**. Name exactly what to add, remove, or transform. Bad: "make it look after the fight". Good: "Add visible smoke clouds and orange embers above the doorway. Remove the unbroken wooden door — replace with splintered fragments scattered on the threshold. Show ${args.referencedAssetNames.join(" / ") || "subjects"} in the same positions and poses."

2. **Preservation clauses are mandatory**. State what must NOT change. Camera position, character poses (when they shouldn't move much), composition, lighting direction, color palette, framing, and any unchanged subjects must be explicitly preserved. Without preservation language, Gemini drifts.

3. **No new characters**. Don't introduce subjects not in the scene description.

4. **Match the scene's narrative**. The full scene description tells you both states. Read it carefully and infer the precise visual change between them.

5. **Concise**. 1-3 sentences. ≤300 chars when possible. Plain English, no markdown, no instructional fluff.

6. **Do NOT describe the anchor frame** — Gemini already has it. Only describe the DELTA: what changes + what stays.

# Examples

PAIR-START (anchor=start, deriving end, direction=FORWARD):
- Scene: "young_link draws master_sword from pedestal — beam of light erupts, dust scatters"
- anchor=start (clean before)
- Output: "Add a vertical beam of golden light erupting from the pedestal where master_sword is being drawn. Add dust motes spiraling upward in the light shaft. Keep young_link's pose, position, and facial expression identical. Keep the temple architecture, camera angle, and surrounding shadows unchanged."

PAIR-END (anchor=end, deriving start, direction=BACKWARD):
- Scene: "ganondorf's hand crashes through the throne room window, glass shatters in slow motion"
- anchor=end (climactic shatter)
- Output: "Remove all flying glass shards and the impact spray — restore the window to fully intact stained glass. Pull ganondorf's fist back outside the window pane (no longer visible inside the room). Keep the throne room interior, lighting, ganondorf's body angle, and the camera composition exactly as shown."`;

  const userMessage = `# Scene context
Act: ${args.act ?? "(unspecified)"}
Beat: ${args.beat ?? "(unspecified)"}
Camera: ${args.camera ?? "(unspecified)"}
Description (covers both start and end states): ${args.sceneDescription}
Anchor side: ${args.pairAnchor.toUpperCase()}${args.anchorDirection ? `\nAnchor rationale: ${args.anchorDirection}` : ""}
Referenced assets: ${args.referencedAssetNames.join(", ") || "(none)"}

Compose the Gemini edit instruction now. Return only the instruction string in the requested schema.`;

  const response = await client.messages
    .stream({
      model: "claude-opus-4-7",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: userMessage }],
      output_config: {
        format: zodOutputFormat(PairedFrameEditSchema),
        effort: "high",
      },
    })
    .finalMessage();

  if (!response.parsed_output) {
    throw new Error("Paired-frame edit instruction generation returned no valid output.");
  }
  return response.parsed_output.edit_instruction;
}
