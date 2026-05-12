import type { StylePreset } from "./loader";

/**
 * AssetKind comes from the assets table column. We map vehicles into the "object"
 * kind (props/vehicles share the same model-sheet pattern); anything else uses the
 * appropriate prompt below. The detectAssetType heuristic is kept for backward compat
 * with old projects that don't have an explicit kind set yet.
 */
export type AssetKind = "character" | "location" | "object";

interface ModelSheetPromptArgs {
  assetName: string;
  baseDescription: string | null;
  role: string | null;
  scope: string | null;
  stylePreset: StylePreset;
  /** Explicit kind from the asset row. If null, falls back to detectAssetType(role). */
  kind: AssetKind | null;
  hasReferenceImages: boolean;
  editInstruction?: string;
}

const STYLE_RENDER_LINES: Record<StylePreset, string> = {
  cinematic_blockbuster:
    "Photorealistic 3D cinematic render, modern live-action blockbuster style, ARRI Alexa cinematography, realistic PBR textures, even neutral key lighting (studio reference, not scene atmosphere).",
  animated_film:
    "Animation-style render, intentional non-photoreal stylization, art-direction-led color and form, even neutral key lighting (studio reference, not scene atmosphere).",
  videogame_gameplay:
    "Real-time game-engine render aesthetic (PS5 / Xbox Series X fidelity), in-engine look with even neutral key lighting (studio reference, not scene atmosphere).",
  prerendered_cutscene:
    "High-fidelity pre-rendered CG cinematic, AAA in-house cinematic team aesthetic (Blizzard / Square Enix / Bungie quality), ray-traced global illumination, even neutral key lighting (studio reference, not scene atmosphere).",
};

/**
 * Backward-compat heuristic for old assets that don't have an explicit kind set.
 * New projects always set kind explicitly via parse_script.
 */
export function detectAssetType(role: string | null): AssetKind {
  if (!role) return "character";
  const r = role.toLowerCase();
  if (
    r.includes("location") ||
    r.includes("set piece") ||
    r.includes("environment") ||
    r.includes("place") ||
    r.includes("landmark") ||
    r.includes("city") ||
    r.includes("castle") ||
    r.includes("temple") ||
    r.includes("dungeon")
  )
    return "location";
  if (
    r.includes("weapon") ||
    r.includes("artifact") ||
    r.includes("item") ||
    r.includes("prop") ||
    r.includes("relic") ||
    r.includes("sword") ||
    r.includes("staff") ||
    r.includes("vehicle") ||
    r.includes("ship") ||
    r.includes("mount") ||
    r.includes("aircraft") ||
    r.includes("car") ||
    r.includes("mech")
  )
    return "object";
  return "character";
}

export function buildAssetModelSheetPrompt(args: ModelSheetPromptArgs): string {
  const renderLine = STYLE_RENDER_LINES[args.stylePreset];
  const editClause = args.editInstruction
    ? `\n\nApply this specific change: ${args.editInstruction}`
    : "";
  const kind = args.kind ?? detectAssetType(args.role);

  switch (kind) {
    case "location":
      return buildLocationPrompt(args, renderLine, editClause);
    case "object":
      return buildObjectPrompt(args, renderLine, editClause);
    case "character":
    default:
      return buildCharacterPrompt(args, renderLine, editClause);
  }
}

function buildCharacterPrompt(
  args: ModelSheetPromptArgs,
  renderLine: string,
  editClause: string,
): string {
  if (args.hasReferenceImages) {
    return `The attached image is the canonical reference for ${args.assetName}${args.role ? ` (${args.role})` : ""}${args.scope ? ` from ${args.scope}` : ""}. Use it as the source of truth.

Your job is to produce a clean three-angle character model sheet that matches this reference exactly:

REFERENCE PRESERVATION (highest priority — non-negotiable):
- Match the costume design exactly — every garment, layer, strap, sash, accessory, and piece of gear visible in the reference must be present in the output
- Match the costume color palette exactly — preserve the dominant colors, secondary colors, and material indicators (fabric vs leather vs metal) shown in the reference
- Match the silhouette exactly — body proportions, hair shape, and pose-readable identity should remain recognizable as the reference
- Match the face and identity exactly
- DO NOT swap, simplify, or reinvent any garment. If the reference shows a green tunic with a blue sash, every angle must show a green tunic with a blue sash.
- DO NOT change colors. Cream is not green. Brown is not blue.
- DO NOT add gear that isn't in the reference. DO NOT omit gear that is.

WHAT YOU ARE COMPOSING (this is what the reference doesn't already show):
- 16:9 horizontal layout, three angles left-to-right: front view, 3/4 hero angle, back view
- Each angle: full body, properly proportioned, fills ~70% of vertical frame
- Neutral seamless mid-gray background — no environment, no scene props
- Even neutral key lighting — studio reference style, no atmospheric effects, no dramatic shadows
- Render aesthetic: ${renderLine}

The output is a clean reference sheet, not a poster or scene. Keep the figure visually consistent across all three angles — same costume, same palette, same gear.${editClause}`;
  }

  return `Generate a clean character model sheet for ${args.assetName}${args.role ? ` (${args.role})` : ""}${args.scope ? ` from ${args.scope}` : ""}.

Character: ${args.baseDescription ?? "Use the role and scope above to infer canonical appearance for this IP."}

Composition:
- 16:9 horizontal layout, three angles left-to-right: front view, 3/4 hero angle, back view
- Full body in each angle, fills ~70% of vertical frame
- Neutral seamless mid-gray background
- Even neutral key lighting (studio reference, not scene atmosphere)
- Render aesthetic: ${renderLine}${editClause}`;
}

function buildLocationPrompt(
  args: ModelSheetPromptArgs,
  renderLine: string,
  editClause: string,
): string {
  if (args.hasReferenceImages) {
    return `The attached image is the canonical reference for ${args.assetName}${args.role ? ` (${args.role})` : ""}${args.scope ? ` from ${args.scope}` : ""}. Use it as the source of truth.

Your job is to produce a clean location reference sheet that matches this reference exactly:

REFERENCE PRESERVATION (highest priority — non-negotiable):
- Match the architecture exactly — every tower, wall, gate, roofline, ornament, and structural element visible in the reference must be present
- Match the color palette and material treatment exactly (stone type, weathering, banners, signage)
- Match the silhouette and overall scale relationships
- DO NOT redesign, modernize, or reinvent the location
- DO NOT change architectural style or materials

WHAT YOU ARE COMPOSING (this is what the reference doesn't already show):
- 16:9 horizontal layout showing three key reference views of the location, arranged left to right:
  1. Wide establishing view (the iconic full silhouette in context)
  2. Mid-distance view (showing facade detail and entrance)
  3. Signature detail (a recognizable architectural feature — gate, throne, tower top, etc.)
- Render the location at the time of day shown in the reference (or neutral overcast if ambiguous)
- Render aesthetic: ${renderLine}

The output is a reference sheet for downstream scene generation, not a single poster shot. Keep the location visually consistent across all three views — same architecture, same palette, same era.${editClause}`;
  }

  return `Generate a location reference sheet for ${args.assetName}${args.role ? ` (${args.role})` : ""}${args.scope ? ` from ${args.scope}` : ""}.

${args.baseDescription ?? "Use the scope above to infer canonical architecture and palette for this IP."}

Composition:
- 16:9 horizontal layout showing three key views: wide establishing, mid-distance, signature architectural detail
- Render aesthetic: ${renderLine}${editClause}`;
}

function buildObjectPrompt(
  args: ModelSheetPromptArgs,
  renderLine: string,
  editClause: string,
): string {
  if (args.hasReferenceImages) {
    return `The attached image is the canonical reference for ${args.assetName}${args.role ? ` (${args.role})` : ""}${args.scope ? ` from ${args.scope}` : ""}. Use it as the source of truth.

Your job is to produce a clean object/prop reference sheet that matches this reference exactly:

REFERENCE PRESERVATION (highest priority):
- Match the form, silhouette, materials, ornament, and color palette exactly
- DO NOT redesign, simplify, or restyle the object

WHAT YOU ARE COMPOSING:
- 16:9 horizontal layout, two or three angles of the object arranged horizontally
- Object isolated on neutral seamless mid-gray background, even neutral key lighting (studio reference, not scene atmosphere)
- For wearable items (helmet, boots, gauntlets): include both worn-on-stand AND a detail close-up
- Render aesthetic: ${renderLine}${editClause}`;
  }

  return `Generate an object reference sheet for ${args.assetName}${args.role ? ` (${args.role})` : ""}${args.scope ? ` from ${args.scope}` : ""}.

${args.baseDescription ?? "Use the role and scope to infer canonical design."}

Composition: 16:9, two or three angles on neutral gray background, even key lighting. Render aesthetic: ${renderLine}${editClause}`;
}
