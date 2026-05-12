import type { StylePreset } from "./loader";
import type { AspectRatio } from "@/lib/providers/claude";
import { PRESET_PROFILES, getSubModeCameraNotes } from "./preset-profiles";

// Each preset is a single rendering description that ALWAYS applies — references dictate
// character identity (costume, palette, proportions, gear, hairstyle) but the project's
// chosen aesthetic dictates how the pixels look. Think live-action Witcher: faithful to
// game character design, but photoreal rendering throughout.
const STYLE_RENDER_LINES: Record<StylePreset, string> = {
  cinematic_blockbuster:
    "Photorealistic 3D cinematic render, modern live-action blockbuster style, ARRI Alexa cinematography, anamorphic lens character with shallow depth of field, realistic PBR textures, subsurface-scattered skin, volumetric lighting, atmospheric haze.",
  animated_film:
    "Animation-style render (think Pixar / DreamWorks / Disney CG), intentional non-photoreal stylization, art-direction-led color and lighting, expressive shape language.",
  videogame_gameplay:
    "Real-time game-engine render aesthetic (PS5 / Xbox Series X fidelity), in-engine look, depth of field tuned for gameplay readability, real-time global illumination.",
  prerendered_cutscene:
    "High-fidelity pre-rendered CG cinematic, AAA in-house cinematic team aesthetic (Blizzard / Square Enix / Bungie quality), photoreal materials with slightly idealized character proportions, ray-traced global illumination, subsurface scattering on skin, anamorphic lens character with cinematic shallow depth of field.",
};

const ASPECT_GUIDANCE: Record<AspectRatio, string> = {
  "16:9": "16:9 horizontal — wider environmental compositions, tolerate longer establishing shots.",
  "9:16": "9:16 vertical — single-subject framing, foreground/background depth, no horizontal panoramas.",
  "1:1": "1:1 square — balanced central composition, mid-density framing.",
  "4:5": "4:5 portrait feed — central subject with vertical breathing room.",
};

const FRAME_ROLE_GUIDANCE: Record<"SINGLE" | "PAIR-START" | "PAIR-END", string> = {
  SINGLE: "This frame is self-contained — it carries the full clip on its own.",
  "PAIR-START":
    "This is the START frame of a pair — it will later be edited forward to the end state. Reserve visual space for what'll be added (explosions, sparks, atmosphere, damage) without rendering it yet. The composition should be the clean 'before' state.",
  "PAIR-END":
    "This is the END frame of a pair — render the climactic state with all complex elements present. The start frame will be derived from this by removing or simplifying. Make this the money shot.",
};

interface KeyframePromptArgs {
  scopeName: string | null;
  sceneDescription: string;
  camera: string | null;
  beat: string | null;
  act: string | null;
  frameRole: "SINGLE" | "PAIR-START" | "PAIR-END";
  anchorDirection: string | null;
  aspectRatio: AspectRatio;
  stylePreset: StylePreset;
  /** Preset sub-mode (e.g. "third_person" for gameplay). Drives camera notes. */
  subMode: string | null;
  referencedAssets: Array<{ name: string; role: string | null }>;
  editInstruction?: string;
}

/**
 * Build the cinematography-focused keyframe prompt per master_workflow §CRITICAL PROMPTING APPROACH.
 *
 * Rules embedded:
 *   - Trust references for character identity — do NOT re-describe appearance
 *   - Focus on camera angle, lighting, atmosphere, action, environment, mood, scale
 *   - Use named references (@CharacterName style)
 *   - Aspect-ratio-aware composition
 *   - Frame-role-aware composition (SINGLE / PAIR-START / PAIR-END)
 */
export function buildKeyframePrompt(args: KeyframePromptArgs): string {
  const renderLine = STYLE_RENDER_LINES[args.stylePreset];
  const aspectLine = ASPECT_GUIDANCE[args.aspectRatio];
  const frameRoleLine = FRAME_ROLE_GUIDANCE[args.frameRole];
  const presetProfile = PRESET_PROFILES[args.stylePreset];
  const subModeNotes = getSubModeCameraNotes(args.stylePreset, args.subMode);
  const hasRefs = args.referencedAssets.length > 0;

  const refsLine = hasRefs
    ? `Attached reference images are CANONICAL for the IDENTITY of: ${args.referencedAssets.map((a) => a.name).join(", ")}.

IDENTITY FIDELITY (highest priority — non-negotiable):
- Preserve costume, signature gear, color palette, proportions, hairstyle, facial structure, and accessory details EXACTLY as shown in the references.
- The character DESIGN comes from the references (think live-action Witcher / live-action Sonic / upcoming Zelda film: faithful to the source character, rendered in the project's chosen aesthetic).
- The references tell you WHO the character is. The Style section below tells you HOW the pixels are rendered (photoreal, animated, in-engine, etc.). Honor BOTH: a photoreal blockbuster render of a recognizable Link, a CG cutscene render of a recognizable Master Chief, etc.
- Do NOT re-describe costume / palette / gear in your generation — pull those from the references. Your job is the cinematography and rendering around them.`
    : "No character/location reference images attached for this scene. Render based on the scope and description.";

  const editClause = args.editInstruction
    ? `\n\nApply this specific change: ${args.editInstruction}`
    : "";

  return `Trailer keyframe — single frame for ${args.scopeName ?? "the project"}.

# Scene
${args.act ? `Act: ${args.act}\n` : ""}${args.beat ? `Beat: ${args.beat}\n` : ""}Action: ${args.sceneDescription}

# Cinematography
- Camera: ${args.camera ?? "appropriate to the action"}${subModeNotes ? `\n- Sub-mode framing: ${subModeNotes}` : ""}
- Aspect-ratio composition: ${aspectLine}
- Frame role: ${frameRoleLine}${args.anchorDirection ? `\n- Anchor rationale: ${args.anchorDirection}` : ""}
- Atmosphere & lighting (preset-specific): ${presetProfile.atmosphereLine}
- Mood: tonal — match the act's emotional register

# References
${refsLine}

# Style
${renderLine}

# Critical
- Compose for impact: scale, depth, intentional negative space.
- DO NOT describe the character's face, body, costume, or gear — the reference images carry that. Adding descriptions here will produce a muddy hybrid.
- DO NOT include text overlays, title cards, subtitles, captions, or watermarks unless explicitly requested.
- The Camera and Sub-mode framing above must be honored EXACTLY — do not substitute with a generic film angle.${editClause}`;
}

