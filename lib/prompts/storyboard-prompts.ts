import type { StylePreset } from "./loader";
import type { AspectRatio } from "@/lib/providers/claude";
import { PRESET_PROFILES, getSubModeCameraNotes } from "./preset-profiles";

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

export interface ReferencedAsset {
  name: string;
  role: string | null;
  /** Used as inline fallback when the asset has NO confirmed reference image. */
  baseDescription?: string | null;
  /** Whether a reference image is attached for this asset. */
  hasReferenceImage?: boolean;
  kind?: "character" | "location" | "object" | null;
}

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
  /** Preset sub-mode (e.g. "open_world_third_person" for gameplay). Drives camera notes. */
  subMode: string | null;
  referencedAssets: ReferencedAsset[];
  editInstruction?: string;
  /** Whether the user attached scene-specific reference image(s) (uploaded via Storyboard). */
  hasSceneReferences?: boolean;
}

/**
 * Build the keyframe prompt. Branches by style preset:
 * - videogame_gameplay → multi-paragraph gameplay-grade prompt mirroring proven
 *   exemplars (Banjo CSV / DK reference). Explicitly frames the output as
 *   "real gameplay capture, NOT cinematic / promotional / posed art" with
 *   explicit camera placement, environment, in-engine palette, and exhaustive
 *   negative prompts.
 * - cinematic_blockbuster / animated_film / prerendered_cutscene → keep the
 *   existing concise format. Those produce reasonable results today.
 */
export function buildKeyframePrompt(args: KeyframePromptArgs): string {
  if (args.stylePreset === "videogame_gameplay") {
    return buildGameplayKeyframePrompt(args);
  }
  return buildStandardKeyframePrompt(args);
}

// ============ Gameplay-mode (rich multi-paragraph) ============

function buildGameplayKeyframePrompt(args: KeyframePromptArgs): string {
  const aspectLine = ASPECT_GUIDANCE[args.aspectRatio];
  const presetProfile = PRESET_PROFILES[args.stylePreset];
  const subModeNotes = getSubModeCameraNotes(args.stylePreset, args.subMode);
  const subMode = args.subMode ?? presetProfile.defaultSubMode ?? "third_person";

  // Map sub-mode to a short camera-placement phrase used in the lead sentence.
  const subModeLeadPhrase: Record<string, string> = {
    open_world_third_person:
      "third-person open-world chase camera with the character centered in frame",
    third_person:
      "tight third-person behind-the-shoulder camera with the character mid-frame",
    first_person: "locked first-person POV camera",
    isometric: "fixed isometric / top-down 3/4 perspective camera",
    over_shoulder_combat:
      "tight over-the-shoulder combat camera with the character's shoulder/weapon prominent in foreground",
  };
  const leadCameraPhrase =
    subModeLeadPhrase[subMode] ?? "third-person gameplay camera with the character centered";

  const scope = args.scopeName ?? "the project";

  // References section. Two cases:
  // 1. Asset has a confirmed reference image attached → identity comes from the image.
  // 2. Asset is referenced in the scene but has no image → fall back to inline
  //    base_description (Banjo CSV pattern of describing identity inline).
  const refsWithImage = args.referencedAssets.filter((a) => a.hasReferenceImage !== false);
  const refsWithoutImage = args.referencedAssets.filter(
    (a) => a.hasReferenceImage === false && a.baseDescription,
  );

  const referencesSection = (() => {
    const parts: string[] = [];
    if (args.hasSceneReferences) {
      parts.push(
        `Image(s) at the very top of your input are scene-specific reference(s) the user uploaded for this exact shot. Treat them as canonical for environment composition, lighting mood, and overall framing — match them closely.`,
      );
    }
    if (refsWithImage.length > 0) {
      parts.push(
        `Attached reference images are CANONICAL identity for: ${refsWithImage
          .map((a) => a.name)
          .join(
            ", ",
          )}. Preserve costume, proportions, colors, signature gear, and silhouette EXACTLY. Do not redesign, simplify, or restyle them. The references tell you WHO they are; the render aesthetic below tells you HOW the pixels look (in-engine, real-time, gameplay-readable).`,
      );
    }
    if (refsWithoutImage.length > 0) {
      const inline = refsWithoutImage
        .map((a) => `- ${a.name}: ${a.baseDescription}`)
        .join("\n");
      parts.push(
        `Identity for these assets is described inline (no reference image uploaded yet — render from these descriptions, preserving silhouette and palette closely):\n${inline}`,
      );
    }
    if (parts.length === 0) {
      return "No character/location/object references attached. Render the scene from the action description and scope below; downstream regenerations after asset references are uploaded will improve fidelity.";
    }
    return parts.join("\n\n");
  })();

  const editClause = args.editInstruction
    ? `\n\nUSER EDIT INSTRUCTION (apply on top of everything above): ${args.editInstruction}`
    : "";

  return `Create a frame that looks like actual ${leadCameraPhrase} gameplay footage from a modern AAA ${scope} game on a current-generation console (PS5 / Xbox Series X / high-end PC). The image must feel like a REAL gameplay screenshot captured during active play — NOT promotional art, NOT a cinematic render, NOT a posed showcase, NOT key art.

# Camera and character placement
${subModeNotes || "Behind-the-back chase camera, character centered, full body visible, mid distance."}
- The character occupies the lower-center region of the frame; the wider playable space (paths, environment, landmarks) remains clearly readable above and around them.
- Camera direction this scene: ${args.camera ?? "appropriate behind-the-back chase camera"}.
- Frame role: ${FRAME_ROLE_GUIDANCE[args.frameRole]}${args.anchorDirection ? `\n- Anchor rationale: ${args.anchorDirection}` : ""}

# Scene context
${args.act ? `Act: ${args.act}\n` : ""}${args.beat ? `Beat: ${args.beat}\n` : ""}Action: ${args.sceneDescription}

# Environment and scene-type framing
The environment must read instantly as the scene's location — landmarks, set dressing, lighting mood, and supporting details from the action description above should be visible and recognizable. Frame this as ${inferSceneTypeHint(args.beat, args.sceneDescription)}. Add gameplay-appropriate environmental detail (vegetation, props, particles, terrain texture) that supports active exploration / combat / traversal as the scene calls for.

# Render aesthetic (in-engine, gameplay-readable)
Ultra-detailed current-generation real-time 3D render. ${presetProfile.atmosphereLine} Realistic PBR textures (fabric, leather, metal, wood, stone, foliage), realistic-but-stylized character proportions, in-engine lighting that matches the time-of-day and location mood. Depth of field tuned for gameplay readability — distant objects remain legible, NOT cinematic shallow-focus.

# References
${referencesSection}

# Aspect ratio
${aspectLine} The composition must read correctly at this ratio.

# Hard negatives — DO NOT
- NOT cinematic film aesthetic (no anamorphic lens flares, no anamorphic crane moves implied, no Dutch angles, no cinematic shallow DoF on environment)
- NOT promotional poster art, NOT key art, NOT a posed showcase, NOT marketing material
- NOT cel-shaded, NOT painterly, NOT anime-style, NOT comic-book stylization
- NOT side-scrolling 2D, NOT isometric (unless explicitly the active sub-mode)
- NO HUD, NO UI overlays, NO health bars, NO objective markers, NO logos, NO text, NO captions, NO watermarks, NO subtitles${editClause}`;
}

/**
 * Heuristic to suggest scene-type framing language ("hub area" / "narrow path" /
 * "boss arena") based on beat and description keywords. Helps the model understand
 * environmental scale and composition.
 */
function inferSceneTypeHint(beat: string | null, description: string): string {
  const text = `${beat ?? ""} ${description}`.toLowerCase();
  if (/title|finale|climax|boss/.test(text)) {
    return "a climactic / boss-arena gameplay shot — dramatic vertical scale, environmental danger cues visible, weighty composition";
  }
  if (/explor|hub|village|town|home|opening/.test(text)) {
    return "an open exploration / hub-area gameplay shot — broad welcoming clearing or hub zone with side routes and landmarks visible, NOT a narrow corridor";
  }
  if (/combat|fight|attack|chase/.test(text)) {
    return "an active combat / chase gameplay shot — visible threat or pursuit, motion in the world around the character";
  }
  if (/establish|wide|reveal/.test(text)) {
    return "an environmental establishing gameplay shot — landmark or vista dominates the frame, character provides scale and player anchor";
  }
  return "a natural exploration gameplay capture — readable playable space, character mid-stride or mid-action";
}

// ============ Standard (cinematic / animated / prerendered_cutscene) ============

function buildStandardKeyframePrompt(args: KeyframePromptArgs): string {
  const renderLine = STYLE_RENDER_LINES[args.stylePreset];
  const aspectLine = ASPECT_GUIDANCE[args.aspectRatio];
  const frameRoleLine = FRAME_ROLE_GUIDANCE[args.frameRole];
  const presetProfile = PRESET_PROFILES[args.stylePreset];
  const subModeNotes = getSubModeCameraNotes(args.stylePreset, args.subMode);
  const hasRefs = args.referencedAssets.some((a) => a.hasReferenceImage !== false);
  const refsWithoutImage = args.referencedAssets.filter(
    (a) => a.hasReferenceImage === false && a.baseDescription,
  );

  const refsLine = (() => {
    const lines: string[] = [];
    if (args.hasSceneReferences) {
      lines.push(
        `Image(s) at the very top of the input are scene-specific reference(s) the user uploaded — treat as canonical for environment composition and lighting.`,
      );
    }
    if (hasRefs) {
      const namedRefs = args.referencedAssets.filter((a) => a.hasReferenceImage !== false);
      lines.push(
        `Attached reference images are CANONICAL for the IDENTITY of: ${namedRefs.map((a) => a.name).join(", ")}.

IDENTITY FIDELITY (highest priority — non-negotiable):
- Preserve costume, signature gear, color palette, proportions, hairstyle, facial structure, and accessory details EXACTLY as shown in the references.
- The character DESIGN comes from the references (think live-action Witcher / live-action Sonic / upcoming Zelda film: faithful to the source character, rendered in the project's chosen aesthetic).
- The references tell you WHO the character is. The Style section below tells you HOW the pixels are rendered (photoreal, animated, in-engine, etc.). Honor BOTH.
- Do NOT re-describe costume / palette / gear in your generation — pull those from the references. Your job is the cinematography and rendering around them.`,
      );
    }
    if (refsWithoutImage.length > 0) {
      const inline = refsWithoutImage
        .map((a) => `- ${a.name}: ${a.baseDescription}`)
        .join("\n");
      lines.push(
        `Identity for these assets is described inline (no reference image uploaded — render from descriptions, preserving silhouette and palette):\n${inline}`,
      );
    }
    if (lines.length === 0) {
      return "No character/location reference images attached for this scene. Render based on the scope and description.";
    }
    return lines.join("\n\n");
  })();

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
