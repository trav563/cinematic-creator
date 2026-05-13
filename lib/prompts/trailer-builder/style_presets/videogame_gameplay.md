# Style Preset — Video Game Gameplay Footage

In-engine / gameplay-footage feel. The trailer should look like real-time gameplay capture, not a CG cinematic.

The viewer should feel like they're WATCHING someone PLAY the game. Not watching a movie. Not watching a cutscene. **Active gameplay capture during play, NOT a posed showcase or cinematic shot.**

## When this preset applies

- `Adaptation style` answer is "video game gameplay footage style", "in-engine", "gameplay-style trailer", or "looks like the player is playing it".
- Trailers that mimic IGN gameplay reveals, Sony State of Play gameplay segments, Xbox Showcase gameplay walkthroughs, Nintendo Direct gameplay sequences.

## Sub-modes

This preset has four sub-modes — pick the one matching the game's actual perspective:

- **Open World — Third Person (centered)** *(default)* — Behind-the-back chase camera, slightly elevated. Character centered horizontally, occupies lower-center of frame, full body visible at medium gameplay distance (~50mm equivalent). Wider playable space remains clearly readable above and around the character. Hub-area / exploration framing. Modern open-world platformer / action-adventure standard (Mario Odyssey / DK Country / 3D platformer remakes / open-world Zelda).
- **Third-person (behind shoulder, tighter)** — Mid-frame, camera tethered behind and slightly above. Tighter than open-world chase. Last of Us / God of War / Tomb Raider.
- **First-person (locked POV)** — Subject's hands/weapon visible at bottom of frame. Wide horizontal FOV (70-90°). Subtle camera bob on movement. Call of Duty / Cyberpunk / Valheim.
- **Isometric (fixed top-down)** — Fixed isometric or top-down 3/4 perspective. Camera height locked. Diablo / Hades / Baldur's Gate 3.
- **Over-shoulder combat (close 3rd person)** — Subject's shoulder/weapon prominent in foreground. Camera snaps to lock-on targets, shakes on heavy impacts. Dark Souls / Sekiro / Resident Evil 4 remake.

The sub-mode chosen at intake drives the camera framing for every keyframe. Unless explicitly a cutscene moment, every scene uses the chosen sub-mode's camera language.

## Keyframe prompt structure (gameplay-mode)

Gameplay-mode keyframes use a multi-paragraph prompt structure (as opposed to the concise cinematic format). Each prompt explicitly establishes:

1. **Lead** — "Frame that looks like actual third-person gameplay footage from a modern AAA [scope] game on a current-generation console. Real gameplay screenshot captured during active play. NOT promotional art, NOT cinematic render, NOT posed showcase."
2. **Camera + character placement** — pulled from the sub-mode. Specifies centering, distance, what fraction of frame the subject occupies. Includes "full body visible" and "destination/playable space readable ahead/around character" for open-world.
3. **Scene context** — act, beat, action.
4. **Environment + scene type** — "exploration hub area" / "narrow combat path" / "boss arena" — inferred from beat / description.
5. **Render aesthetic** — real-time GI bloom, screen-space reflections, gameplay particle FX, gameplay-readable depth of field. In-engine look.
6. **Reference policy** — attached references are CANONICAL identity. Preserve costume / proportions / colors EXACTLY. If an asset has no confirmed variation, fall back to its inline `base_description`.
7. **Negatives** — explicit list: NOT cinematic film, NOT promotional poster art, NOT cel-shaded, NOT painterly, NOT anime, NOT side-scrolling, no HUD/UI overlays, no logos, no text, no captions, no watermarks.
8. **Aspect ratio** — explicit at the bottom.

The system handles this assembly automatically — this section documents the contract that `buildKeyframePrompt` enforces for every gameplay-mode scene.

## Render style line

`real-time game-engine render, in-engine gameplay aesthetic, modern AAA console fidelity (PS5 / Xbox Series X / high-end PC), real-time global illumination, screen-space reflections, temporal anti-aliasing, depth of field tuned for gameplay readability not cinematic shallow focus`

## Lens / camera language

- Spherical (not anamorphic) lensing — gameplay cameras don't have anamorphic squeeze.
- Mid focal lengths typical of third-person and first-person game cameras (50mm-equivalent feel for third-person; ~70-90° horizontal FOV for first-person).
- Moderate depth of field — UI-readable, not cinematic-shallow. Distant objects should remain legible.
- Dynamic camera follow language matches the sub-mode (see above).
- Avoid theatrical crane moves and Steadicam tracking — gameplay cameras snap, follow, and rubber-band differently.

## Material / lighting language

- Modern PBR with the slightly cleaner, less-grimy material treatment typical of real-time engines (Unreal 5, Decima, RE Engine, Snowdrop).
- Real-time global illumination look — Lumen-style soft bounce light, screen-space ambient occlusion, baked-feeling shadow softness on distant geometry.
- Subtle temporal artifacts that read as game footage: faint TAA ghosting on motion edges, screen-space reflection holes in puddles when the camera tilts.
- Particle effects with the read of in-engine VFX (sparks, muzzle flashes, magic FX) — slightly stylized, not Hollywood-photoreal.

## Color grade defaults

- Less aggressive than theatrical grade — more even exposure, milder contrast, broader latitude in highlights so the player can read the action.
- Studio-style grading per franchise: Sony first-party (warm, saturated); Microsoft Xbox showcase (clean, neutral); From Software (desaturated, muted earth + accent color); Nintendo (saturated, broad gamut).
- Avoid theatrical hero/threat color split — game palettes tend to be world-coherent rather than scene-symbolic.

## Motion language (Kling prompts)

For motion prompts on gameplay-mode scenes, use in-engine camera vocabulary. ALLOWED verbs:

- `behind-shoulder follow accelerates`, `chase camera follow`, `open-world traversal pan`, `hub-area orbit`
- `lock-on snap to target`, `first-person camera bob`, `controller-look pan`
- `gameplay zoom-in (telescope / aim)`, `controlled camera shake (impact)`
- `third-person orbit around player`, `isometric pan`, `mid-distance follow rubber-bands behind subject`

FORBIDDEN (these scream cinematic, not gameplay):

- `anamorphic crane`, `rack focus (cinematic shallow DoF)`, `drone reveal (theatrical)`, `Steadicam tracking`, `whip pan (cinematic)`

## What to avoid

- **No anamorphic lens flares or oval bokeh** — dead giveaway that it's a CG cinematic, not gameplay.
- **No heavy film grain.** Light grain or none at all.
- **No theatrical color grade** with crushed shadows and orange-and-teal — that screams trailer, not game.
- **No cinematic shallow focus** that obscures gameplay-relevant elements.
- **No 24fps motion blur judder.** Gameplay reads at 30 or 60 fps with corresponding motion blur character.
- **No magical Hollywood lighting** — every light source should plausibly exist in the game world.
- **No off-camera cinematic foley** — sound design suggestions should match what would actually be in-engine audio.
- **No HUD, no UI, no logos, no text overlays, no watermarks.** Even though real gameplay has a HUD, generated keyframes should be the clean "marketing screenshot" version of gameplay — gameplay framing, no chrome.
- **No posed showcase shots.** No characters facing camera, no hero portraits, no "model sheet" stances. Subject is mid-action, mid-traversal, mid-combat.

## Reference director / studio anchors

These are studios known for gameplay (not cinematic) presentation:

- **Naughty Dog** (The Last of Us Part II, Uncharted 4) — third-person follow camera, behind-the-shoulder action.
- **Kojima Productions** (Death Stranding, MGSV) — long held shots, environmental storytelling, methodical pacing.
- **From Software** (Elden Ring, Bloodborne) — locked behind-the-shoulder, deliberate camera, painterly-but-real-time materials.
- **Rockstar** (RDR2, GTA V) — wide environmental gameplay, dynamic weather, lived-in worlds.
- **Insomniac** (Spider-Man 2) — high-mobility traversal, swoopy follow camera, vibrant city color.
- **Guerrilla** (Horizon Forbidden West) — vibrant nature, alien wildlife, third-person bow combat camera.
- **CD Projekt Red** (Cyberpunk 2077) — first-person, dense urban detail, neon-driven palette.
- **Santa Monica** (God of War Ragnarök) — single-take camera, over-the-shoulder, axe combat framing.
- **Nintendo EPD** (Zelda BOTW/TOTK, Mario Odyssey) — open-world chase camera, hub-area framing, broadly-readable scenes.
- **Rare / Microsoft** (Banjo-Kazooie, Sea of Thieves) — centered character, full-body visible, exploration-friendly cameras.
