# Style Preset — Animated Film

Stylized animation — Pixar / DreamWorks 3D, hand-drawn anime, Spider-Verse-style mixed media, Studio Ghibli, Arcane.

## When this preset applies

- `Adaptation style` answer is "animated film adaptation", "Pixar-style", "anime-style", "Spider-Verse-style", or "stylized animation".
- The user wants the trailer to feel like an animated theatrical release, not live-action and not in-engine.
- IMPORTANT: This preset has multiple sub-modes. **Pick the closest at intake** and note in the locked brief which one is in play, since the lens/material language varies significantly between them.

## Sub-modes

Confirm one with the user during intake (Q3 follow-up if this preset loads):

1. **Pixar / DreamWorks 3D feature** — modern stylized 3D, expressive but proportional characters, clean rendering, high color fidelity.
2. **Modern theatrical anime** — hand-drawn or cel-look digital, anime character proportions (large expressive eyes, simplified line work, painted backgrounds). Studio Ghibli vs. Madhouse vs. ufotable vs. Wit/MAPPA each tilt this.
3. **Spider-Verse / mixed media** — comic-book half-tone overlays, line work over rendered surfaces, intentional frame-rate variation, paper texture, motion smear stylization.
4. **Arcane / painterly 3D** — hand-painted texture work over 3D geometry, brush-stroke surface detail, strong art-direction-led color.

The render style line, lens language, and "what to avoid" sections below describe the SHARED rules; the sub-mode you pick refines the specifics.

## Render style line (template — fill in sub-mode)

`<sub-mode-specific phrase> animation style, intentional non-photoreal stylization, art-direction-led color and lighting, <sub-mode-specific render note>`

Examples:
- Pixar: `Pixar feature-film 3D animation style, expressive stylized character proportions, soft clean rendering, art-direction-led lighting, no photoreal pore detail, no live-action lensing`
- Anime: `theatrical anime style, hand-drawn cel-look character animation with painted backgrounds, simplified anatomy with expressive eyes, anime line work, watercolor sky treatment`
- Spider-Verse: `Spider-Verse mixed-media animation style, comic-book half-tone overlays and Ben-Day dots on shadows, hand-drawn line work over rendered surfaces, intentional frame-rate stutter, paper grain texture`
- Arcane: `Arcane painterly 3D animation style, hand-painted texture work over 3D geometry, visible brush strokes on surfaces, strong art-direction-led color palettes, theatrical lighting with painted shadow language`

## Lens / camera language

- Lens language is **stylized, not photoreal**. Animated cinematography uses focal-length analogues but ignores real-camera physics.
- Pixar/DreamWorks: smooth virtual camera, considered framing, clean focus pulls.
- Anime: locked frames with held compositions, sudden cuts, occasional dramatic Dutch angles, "camera" as a storytelling tool not a physical object.
- Spider-Verse: aggressive angle changes, comic-panel framing, parallax dolly through layered space.
- Arcane: cinematic 3D camera with theatrical staging.
- **Depth of field is a stylization choice, not a physical accident.** Use it where it serves emotion, not where a camera would naturally be limited.

## Material / lighting language

- Stylized PBR or non-PBR — sub-mode dependent.
- **Lighting is art-directed, not physically accurate.** Hero rim light with no plausible source, color-coded mood lighting, painted shadow shapes — all on the table.
- Surface detail is intentional, not exhaustive — fewer surface micro-details than live-action; readable shape language is the priority.
- Particle and FX work matches the chosen sub-mode (Pixar's clean stylized FX vs. anime's hand-drawn smoke shapes vs. Spider-Verse's comic-book SFX text vs. Arcane's painted magic).

## Color grade defaults

- Saturated, broader gamut than live-action — animation embraces color.
- Strong palette per scene (often per-act) — color is a primary storytelling tool, not subordinate to natural light.
- High contrast between palette zones — hero areas vs. threat areas can have radically different palette logic.
- Avoid neutral Hollywood theatrical grading — that flattens animated work.

## What to avoid

- **No photoreal pore-level skin detail.** That breaks the stylization contract.
- **No live-action anamorphic lens flares** unless the sub-mode is Spider-Verse and they're being used ironically as comic-panel motion lines.
- **No PBR metal microsurface realism** in characters' eyes / skin — that drifts into uncanny valley.
- **No cinematic 24fps motion blur judder** for anime — anime is on 2s and 3s (hold frames, lower effective frame rate for character animation, smooth for camera moves).
- **No "video game screenshot" rendering language** — gameplay TAA artifacts and screen-space reflection look broken in animated context.
- **No "photoreal" descriptor anywhere** — defeats the entire preset.

## Reference director / studio anchors

Pick references matching the sub-mode:

- **Pixar / DreamWorks 3D:** Pete Docter (Up, Inside Out), Brad Bird (The Incredibles), Dean DeBlois (How to Train Your Dragon).
- **Modern theatrical anime:** Hayao Miyazaki (Spirited Away — Studio Ghibli warmth), Makoto Shinkai (Your Name — hyper-detailed lighting), Mamoru Hosoda (Wolf Children — emotional realism), Satoshi Kon (Paprika — surreal cuts).
- **Spider-Verse / mixed media:** Bob Persichetti / Peter Ramsey / Rodney Rothman (Spider-Verse), Joaquim Dos Santos / Kemp Powers / Justin K. Thompson (Across the Spider-Verse), Mike Rianda (The Mitchells vs. the Machines).
- **Arcane / painterly 3D:** Pascal Charrue / Arnaud Delord (Arcane), Mikros Animation team aesthetic.
