import type { StylePreset } from "./loader";

/**
 * Per-style-preset camera and motion profiles. This is the SOURCE OF TRUTH for what
 * camera vocabulary each preset uses; the .md files in style_presets/ remain as
 * reinforcement content but the structured data here drives the system prompts.
 *
 * Why: previously, claude.ts hardcoded film camera vocabulary ("Dutch angles, anamorphic
 * cranes, extreme close-ups...") in the role definition at the top of every system
 * prompt, regardless of preset. The preset .md was appended at the bottom and lost the
 * authority battle. Result: gameplay projects came back full of cinematic film angles.
 *
 * The fix: inject PresetProfile.cameraVocabulary at the TOP of the system prompt as
 * the primary, authoritative camera language. Add forbiddenCameraVocabulary so Claude
 * knows what to AVOID for each preset.
 */

export interface PresetSubMode {
  value: string;
  label: string;
  /** Specific camera language for this sub-mode, woven into the keyframe prompt. */
  cameraNotes: string;
  /** Optional motion-verb additions for this sub-mode (added to the preset's base list). */
  motionVerbAdditions?: string[];
}

export interface PresetProfile {
  preset: StylePreset;
  /** Allowed camera angle types — Claude picks from this list when filling scenes. */
  cameraVocabulary: string[];
  /** Camera types Claude must AVOID for this preset. */
  forbiddenCameraVocabulary: string[];
  /** Kling motion verbs that match this preset's aesthetic. */
  motionVerbVocabulary: string[];
  /** Motion verbs to avoid for this preset. */
  forbiddenMotionVerbs: string[];
  /** Atmospheric/sensory line for buildKeyframePrompt. */
  atmosphereLine: string;
  /** One-paragraph summary of the preset's framing identity. Goes at TOP of system prompts. */
  identityBlurb: string;
  /** Sub-modes for presets that have meaningful internal variation. */
  subModes: PresetSubMode[];
  /** Default sub-mode value if user doesn't pick one. null if preset has no sub-modes. */
  defaultSubMode: string | null;
}

export const PRESET_PROFILES: Record<StylePreset, PresetProfile> = {
  cinematic_blockbuster: {
    preset: "cinematic_blockbuster",
    identityBlurb:
      "Hollywood live-action realism — what a $200M theatrical trailer looks like. ARRI Alexa cinematography, anamorphic lens character, every shot composed for the big screen.",
    cameraVocabulary: [
      "extreme close-up",
      "medium close-up",
      "wide environmental shot",
      "low-angle hero shot",
      "Dutch angle",
      "POV / over-shoulder",
      "two-shot",
      "profile shot",
      "insert shot",
      "anamorphic crane reveal",
      "tracking shot",
      "Steadicam follow",
    ],
    forbiddenCameraVocabulary: [
      "first-person video-game POV",
      "behind-the-shoulder gameplay follow",
      "fixed isometric",
      "over-shoulder combat camera (gameplay style)",
      "in-engine free-camera",
    ],
    motionVerbVocabulary: [
      "dolly in",
      "dolly out",
      "slow push-in",
      "pull-out reveal",
      "anamorphic crane up",
      "crane down",
      "pan left / pan right",
      "tilt up / tilt down",
      "rack focus",
      "whip pan",
      "Steadicam follow",
      "handheld micro-tremor",
      "locked-off tableau",
      "drone reveal",
    ],
    forbiddenMotionVerbs: [
      "lock-on snap (gameplay)",
      "first-person bob",
      "controller-look pan",
      "behind-shoulder gameplay follow",
    ],
    atmosphereLine:
      "Volumetric haze, dust motes in light shafts, anamorphic lens flares (sparingly), atmospheric smoke and weather, practical light sources (sun / fire / neon / sodium streetlamp / monitor glow), motion blur on fast action, depth-of-field falloff.",
    subModes: [],
    defaultSubMode: null,
  },

  videogame_gameplay: {
    preset: "videogame_gameplay",
    identityBlurb:
      "Real-time game-engine gameplay footage. The viewer should feel like they're WATCHING someone PLAY the game, not watching a movie. In-engine cameras follow gameplay conventions: behind the character, locked first-person, fixed isometric — never theatrical Steadicam or Dutch angles.",
    cameraVocabulary: [
      "behind-the-shoulder third-person follow",
      "locked first-person POV",
      "fixed isometric",
      "over-the-shoulder combat camera",
      "mid-distance gameplay follow",
      "lock-on tracking",
      "first-person aim-down-sights",
      "third-person free-camera orbit",
      "gameplay establishing wide (camera tethered to player)",
      "objective-marker zoom",
    ],
    forbiddenCameraVocabulary: [
      "Dutch angle",
      "anamorphic crane",
      "theatrical Steadicam tracking",
      "extreme close-up (cinematic portrait)",
      "POV that breaks gameplay-camera conventions",
      "impossible camera (through walls, inside engines)",
    ],
    motionVerbVocabulary: [
      "behind-shoulder follow accelerates",
      "lock-on snap to target",
      "first-person camera bob",
      "controller-look pan",
      "gameplay zoom-in (telescope / aim)",
      "controlled camera shake (impact)",
      "third-person orbit around player",
      "isometric pan",
      "mid-distance follow rubber-bands behind subject",
    ],
    forbiddenMotionVerbs: [
      "anamorphic crane",
      "rack focus (cinematic shallow DoF)",
      "drone reveal (theatrical)",
      "Steadicam tracking",
      "whip pan (cinematic)",
    ],
    atmosphereLine:
      "Real-time global illumination bloom, screen-space reflections in puddles and metal, real-time shadow softness, gameplay particle FX (sparks, muzzle flashes, magic VFX), subtle TAA temporal artifacts on motion edges, gameplay-readable depth of field (NOT cinematic-shallow).",
    subModes: [
      {
        value: "third_person",
        label: "Third-person (behind shoulder)",
        cameraNotes:
          "Behind-the-shoulder third-person follow camera. Subject is mid-frame, camera tethered behind and slightly above. Mid focal length (~50mm equivalent). Modern action-adventure standard (Last of Us / God of War / Tomb Raider).",
        motionVerbAdditions: ["third-person follow accelerates", "orbit around player"],
      },
      {
        value: "first_person",
        label: "First-person (locked POV)",
        cameraNotes:
          "Locked first-person camera. Subject's hands/weapon visible at bottom of frame. Wide horizontal FOV (70-90°). Subtle camera bob on movement. NO third-person cuts unless explicitly a cutscene moment. Modern shooter / immersive sim convention (Call of Duty / Cyberpunk / Valheim).",
        motionVerbAdditions: ["first-person bob", "aim-down-sights snap", "controller-look pan"],
      },
      {
        value: "isometric",
        label: "Isometric (fixed top-down)",
        cameraNotes:
          "Fixed isometric or top-down 3/4 perspective. Camera height locked, no rotation. Mid-distance — multiple subjects visible. Pan only via subject movement, never zooms or tilts. ARPG / strategy / roguelike convention (Diablo / Hades / Baldur's Gate 3).",
        motionVerbAdditions: ["isometric pan follows subject", "fixed-height camera glide"],
      },
      {
        value: "over_shoulder_combat",
        label: "Over-shoulder combat (close 3rd person)",
        cameraNotes:
          "Tight over-the-shoulder combat camera. Subject's shoulder/weapon prominent in foreground. Camera reacts to combat — snaps to lock-on targets, shakes on heavy impacts. Souls-like / modern action convention (Dark Souls / Sekiro / Resident Evil 4 remake).",
        motionVerbAdditions: ["lock-on snap", "combat camera shake on impact", "tight orbit during attack"],
      },
    ],
    defaultSubMode: "third_person",
  },

  animated_film: {
    preset: "animated_film",
    identityBlurb:
      "Stylized animation — Pixar feature 3D / theatrical anime / Spider-Verse mixed media / Arcane painterly. Intentional non-photoreal stylization, expressive over-cranked motion, art-direction-led color and lighting.",
    cameraVocabulary: [
      "expressive POV",
      "exaggerated wide",
      "dynamic crane",
      "snap zoom",
      "animation push-in",
      "pose-to-pose hold",
      "graphic two-shot",
      "stylized over-shoulder",
      "art-directed insert",
      "expressive low angle",
    ],
    forbiddenCameraVocabulary: [
      "live-action anamorphic lens flare (only in mixed-media context)",
      "first-person video-game POV",
      "behind-shoulder gameplay follow",
      "fixed isometric (gameplay)",
      "ARRI / RED-style cinema realism",
    ],
    motionVerbVocabulary: [
      "over-cranked snap zoom",
      "exaggerated push-in",
      "pose-to-pose snap",
      "graphic whip pan",
      "stylized parallax dolly",
      "animated rack focus",
      "smear-frame motion",
      "expressive crane up",
      "snap-to-hold camera move",
    ],
    forbiddenMotionVerbs: [
      "rack focus (cinematic shallow DoF — only in painterly sub-mode)",
      "ARRI-style anamorphic crane",
      "first-person bob",
      "lock-on snap (gameplay)",
    ],
    atmosphereLine:
      "Stylized lighting (art-direction-led color, painted shadows, graphic light shapes), expressive shape language, optional sub-mode-specific texture (paper grain for Spider-Verse / brush strokes for Arcane / soft Pixar volumetrics).",
    subModes: [
      {
        value: "pixar",
        label: "Pixar / DreamWorks 3D",
        cameraNotes:
          "Modern stylized 3D animation. Expressive but proportional characters. Soft clean rendering. Cinema-aware framing but with animated freedom (impossible camera moves OK). Reference: Pixar / DreamWorks / Sony Animation feature look.",
      },
      {
        value: "anime",
        label: "Theatrical anime (cel + painted)",
        cameraNotes:
          "Hand-drawn cel-look characters with painted backgrounds. Anime proportions (large expressive eyes, simplified line work). Camera moves often static-with-pan rather than continuous tracking. Reference: Studio Ghibli / Madhouse / ufotable / MAPPA.",
      },
      {
        value: "spider_verse",
        label: "Spider-Verse mixed media",
        cameraNotes:
          "Comic-book half-tone overlays, hand-drawn line work over rendered surfaces, intentional frame-rate variation, paper texture. Frequent graphic snap-zooms and Ben-Day dot shadow shifts. Reference: Into the Spider-Verse / Across the Spider-Verse.",
        motionVerbAdditions: ["frame-rate stutter on impact", "comic-panel snap-cut", "half-tone shadow flash"],
      },
      {
        value: "arcane",
        label: "Arcane painterly 3D",
        cameraNotes:
          "Hand-painted texture work over 3D geometry. Visible brush strokes on surfaces. Theatrical lighting with painted shadow language. Camera moves slower and more deliberate than Pixar — closer to live-action cinematography. Reference: Arcane / Love Death + Robots painterly episodes.",
      },
    ],
    defaultSubMode: "pixar",
  },

  prerendered_cutscene: {
    preset: "prerendered_cutscene",
    identityBlurb:
      "High-fidelity pre-rendered CG cinematic — the in-house cinematic team treatment. Blizzard cinematics / Square Enix CG / Bungie / Riot. Photoreal materials with slightly idealized character proportions. Cinematic camera moves with the freedom of CG (impossible camera, through walls, inside engines used sparingly).",
    cameraVocabulary: [
      "anamorphic close-up",
      "hero pull-back",
      "aggressive cinematic crane",
      "impossible camera (through walls / inside engines)",
      "ray-traced GI hero shot",
      "extreme low-angle reveal",
      "dramatic two-shot",
      "wide environmental establishing",
      "POV / over-shoulder (cinematic)",
      "Dutch angle (used sparingly for tension)",
    ],
    forbiddenCameraVocabulary: [
      "first-person gameplay POV",
      "behind-shoulder gameplay follow",
      "fixed isometric (gameplay)",
      "lock-on combat camera",
      "obvious gameplay HUD framing",
    ],
    motionVerbVocabulary: [
      "impossible-camera dolly through space",
      "hero pull-back reveal",
      "anamorphic crane up",
      "ray-traced rack focus",
      "aggressive push-in to character",
      "orbital fly-around",
      "dramatic tilt up to title",
      "slow-motion impact zoom",
      "cinematic Steadicam glide",
    ],
    forbiddenMotionVerbs: [
      "lock-on snap (gameplay)",
      "first-person bob",
      "controller-look pan",
      "behind-shoulder gameplay follow",
    ],
    atmosphereLine:
      "Ray-traced global illumination, sub-surface scattering on skin, anamorphic lens flares, cinematic shallow depth of field, volumetric god rays, atmospheric haze, photoreal material weathering (sweat, grime, blood, soot, scratches).",
    subModes: [],
    defaultSubMode: null,
  },
};

/**
 * Build the primary camera-language directive injected at the TOP of every Claude
 * system prompt. This is what overrides the model's default cinematic-film bias.
 */
export function buildPresetCameraDirective(
  preset: StylePreset,
  subMode: string | null,
): string {
  const profile = PRESET_PROFILES[preset];
  const sub = subMode
    ? profile.subModes.find((m) => m.value === subMode)
    : null;

  const lines: string[] = [
    `# Project rendering identity (READ FIRST — this overrides any default cinematic instincts)`,
    ``,
    profile.identityBlurb,
    ``,
    `## Allowed camera vocabulary for THIS project`,
    `When writing camera fields or referencing camera angles, pick from these and only these:`,
    ...profile.cameraVocabulary.map((v) => `- ${v}`),
  ];

  if (sub) {
    lines.push(
      ``,
      `## Sub-mode: ${sub.label}`,
      sub.cameraNotes,
    );
  }

  lines.push(
    ``,
    `## FORBIDDEN camera vocabulary for THIS project`,
    `Do NOT use these — they break the project's rendering identity:`,
    ...profile.forbiddenCameraVocabulary.map((v) => `- ${v}`),
    ``,
    `Camera variety still matters: no two consecutive scenes should share the same camera angle type — but the variety must come from within the ALLOWED list above.`,
  );

  return lines.join("\n");
}

/**
 * Build the motion-verb directive used by generateMotionPrompts. Same idea — preset's
 * allowed verbs at the top, forbidden ones called out explicitly.
 */
export function buildPresetMotionDirective(
  preset: StylePreset,
  subMode: string | null,
): string {
  const profile = PRESET_PROFILES[preset];
  const sub = subMode
    ? profile.subModes.find((m) => m.value === subMode)
    : null;

  const verbs = [
    ...profile.motionVerbVocabulary,
    ...(sub?.motionVerbAdditions ?? []),
  ];

  return [
    `## Motion vocabulary for THIS project (use these verbs ONLY)`,
    ...verbs.map((v) => `- ${v}`),
    ``,
    `## FORBIDDEN motion verbs (break the project's identity — do NOT use)`,
    ...profile.forbiddenMotionVerbs.map((v) => `- ${v}`),
  ].join("\n");
}

/**
 * Camera notes for the sub-mode, used in buildKeyframePrompt's Camera section.
 * Returns empty string if no sub-mode is set.
 */
export function getSubModeCameraNotes(
  preset: StylePreset,
  subMode: string | null,
): string {
  if (!subMode) return "";
  const profile = PRESET_PROFILES[preset];
  const sub = profile.subModes.find((m) => m.value === subMode);
  return sub?.cameraNotes ?? "";
}
