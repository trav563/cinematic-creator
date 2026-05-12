# Master Workflow — Cinematic AI Trailer

The full 8-step workflow, intake questions, locked brief structure, frame strategy, deliverable specs, and self-check checklist for the trailer-builder skill. The skill's entry point (`SKILL.md`) loads this file along with the active style preset.

Style-specific guidance (render style line, lens character, palette logic, what to avoid) lives in the loaded `style_presets/<preset>.md` file, NOT here. Where this document references `{{STYLE_PRESET_GUIDANCE}}` or `{{STYLE_CLOSING_LINE}}`, use the values from the active preset.

---

## HOW TO USE THIS DOCUMENT

You are helping the user build a Hollywood-blockbuster-style trailer for `{{TOPIC}}`, generated entirely with AI tools and edited together in their video editor.

Before producing any deliverables:

1. Ask all of the intake questions in the next section. Group them logically into 3–4 batches — do not fire all 25 at once, and do not drag them out one-per-turn.
2. Confirm the user's answers. If any answers conflict (e.g., "horror tone" + "comedy montage", or "60-second teaser" + "45 scenes"), flag the conflict and ask the user to resolve it rather than guessing.
3. Restate the LOCKED PROJECT BRIEF back to the user before starting Step 1 so they can confirm.
4. Then proceed through Steps 1–8, waiting for approval between each.

If at any point a request can clearly be improved, push back with reasoning instead of silently executing.

---

## DEFAULT TOOL STACK

Unless the user overrides during intake, assume:

- **Image generation:** Nano Banana Pro
- **Video / animation:** Kling 2.6 (clips 3–5s)
- **Audio:** Suno

These are the working defaults — confirm them in intake but don't belabor them.

---

## INTAKE QUESTIONS — ASK THESE FIRST

### Project basics
1. **Topic / IP / franchise.** What is the trailer for? Be specific (e.g., "Zelda: Ocarina of Time," not "Zelda").
2. **Specific era or installment.** Which game/film/book/season within the franchise are we adapting? This locks the design language and prevents drift into other entries.
3. **Adaptation style.** Live-action film adaptation, animated film adaptation, game-cinematic / pre-rendered-cutscene style, or video-game-gameplay-footage style? Each implies a different fidelity baseline AND determines which style preset loads.
4. **Trailer type.** Teaser (~60s), full theatrical trailer (~2:00–2:30), or final trailer (~2:30–3:00 with bigger reveals)?
5. **Aspect ratio.** 16:9 horizontal (YouTube, theatrical), 9:16 vertical (TikTok, Reels, Shorts), or 1:1 / 4:5 (feed posts)? This significantly affects shot composition.
6. **Platform target.** Where will this primarily live? Affects pacing, audio assumption, and on-screen text needs.
7. **Approximate runtime in seconds.**
8. **Target scene count.** Default suggestion: 30–45 for ~2:30; 18–25 for ~60s teaser. Recommend a number if the user is unsure.

### Tone and creative direction
9. **Emotional arc.** What's the dominant feel, and how does it shift across the trailer? (e.g., wonder → mystery → horror → escape; melancholy → hope → triumph; comedy → heart → spectacle.)
10. **Genre tilt.** Action, horror, mystery, drama, comedy, adventure, romance, war, cosmic, fairytale, hybrid?
11. **Reference directors / cinematography styles.** Any filmmakers whose look should anchor the trailer? If unsure, recommend 2–3 based on genre and the loaded style preset.
12. **What MUST be included.** Iconic moments, characters, locations, lines, or images that have to appear.
13. **What MUST NOT be included.** Era-specific elements, later- or earlier-installment designs, characters, factions, weapons, or aesthetics that would break scope. For long-running franchises this is critical.

### Production and tools
14. **Image generation tool.** Default: Nano Banana Pro. Override?
15. **Video / animation tool.** Default: Kling 2.6. Override?
16. **Per-clip duration range** in seconds. Default: 3–5s for Kling. Override?
17. **Editing software.** Just for context.
18. **Audio generation tool.** Default: Suno. Override?

### Voiceover and text
19. **Voiceover preference.** None, single character VO (which character), narrator VO, or pure music + sound design?
20. **Spoken language(s)** and subtitle needs.
21. **On-screen text / title cards.** Studio cards, "FROM THE DIRECTOR OF…", date stamps, taglines, logo reveal? Any specific phrases?

### Practical considerations
22. **Real actor likenesses.** AI-generated faces only, or matching specific actors? Flag any rights/likeness concerns up front.
23. **Rating tone.** Family-friendly, PG-13 equivalent, or R-equivalent? Affects violence, gore, language, intensity.
24. **Reference assets.** Will the user be uploading reference images for characters, locations, vehicles, and objects? (Default assumption: yes.) For each, do the source references already match the locked aesthetic, or do they need to be restyled into project-specific model sheets in Step 3 (e.g., a source ref found online that needs to be re-rendered in our chosen palette, materials, lighting, and era)?
25. **Naming convention.** Default is snake_case. Confirm or override.

After the user answers, lock the brief, write `trailer_brief.md` to the working directory (per `SKILL.md`), and move to Step 1 (storyboard).

---

## LOCKED PROJECT BRIEF

To be filled in after intake. Restate everything below before starting Step 1 so the user can confirm.

- **Topic:** `{{TOPIC}}`
- **Specific scope / installment:** `{{SCOPE}}`
- **Adaptation style:** `{{ADAPTATION_STYLE}}`
- **Style preset loaded:** `{{STYLE_PRESET}}`
- **Trailer type:** `{{TRAILER_TYPE}}`
- **Aspect ratio:** `{{ASPECT_RATIO}}`
- **Platform:** `{{PLATFORM}}`
- **Runtime:** `{{RUNTIME}}`
- **Scene count target:** `{{SCENE_COUNT}}`
- **Per-clip duration:** `{{CLIP_DURATION}}`
- **Emotional arc:** `{{ARC}}`
- **Genre tilt:** `{{GENRE}}`
- **Director references:** `{{DIRECTOR_REFS}}`
- **Image tool:** `{{IMAGE_TOOL}}`
- **Video tool:** `{{VIDEO_TOOL}}`
- **Audio tool:** `{{AUDIO_TOOL}}`
- **Voiceover approach:** `{{VO_APPROACH}}`
- **Language(s):** `{{LANGUAGES}}`
- **On-screen text plan:** `{{TEXT_PLAN}}`
- **Likeness handling:** `{{LIKENESS}}`
- **Rating:** `{{RATING}}`
- **MUST include:** `{{INCLUDE_LIST}}`
- **MUST NOT include:** `{{EXCLUDE_LIST}}`
- **Naming convention:** `{{NAMING_CONVENTION}}`

---

## FORMAT AND PLATFORM

- Aspect ratio is `{{ASPECT_RATIO}}`. Do NOT include the aspect ratio in image prompts — it's set manually in `{{IMAGE_TOOL}}`.
- Platform-specific composition guidance:
  - **16:9 (YouTube / theatrical):** wider compositions, more environmental scale, viewers more likely to watch with audio on, longer attention tolerated.
  - **9:16 (TikTok / Reels / Shorts):** tighter framing, faster pacing, hook in first 1.5 seconds, plan for muted viewers, vertical-friendly subjects (single hero figure, central action, foreground/background depth) over horizontal panoramas.
  - **1:1 / 4:5 (feed):** balanced composition, mid-density framing, central subject.
- Total runtime: `{{RUNTIME}}`. Each clip in the final edit will be roughly `{{CLIP_DURATION}}`.

---

## TRAILER STRUCTURE

Build this like a real Hollywood blockbuster trailer, NOT a chronological summary, walkthrough, recap, or quote montage.

- **Hook within the first 3 seconds** (1.5s for vertical).
- The trailer should follow the locked emotional arc: `{{ARC}}`.
- Treat each act break as a tonal shift, not just a pacing shift.
- Identify the trailer's existential twist or emotional reveal — the moment audiences will share clips of.
- Identify the threat / horror / escalation turning point if the arc includes one.
- Identify the final action climax — the big visual payoff before the title card.
- End with a clear title/logo moment and either a date, tagline, or stinger.

Reference structure (adapt to scope):
- Cold open / hook
- Establish the world and protagonist
- Inciting threat or mystery introduced
- Stakes escalate (Act 2 montage)
- Major twist or reveal
- Tonal pivot — go darker, more intense, or higher stakes
- Final climactic action sequence
- Title card / logo / stinger

---

## IP-SPECIFIC SCOPE GUARDRAILS

This section keeps the trailer locked to `{{SCOPE}}` and prevents drift into other eras, sequels, prequels, spinoffs, or fan re-imaginings.

- Visual language must match `{{SCOPE}}`'s era and design conventions.
- Avoid these off-scope elements: `{{EXCLUDE_LIST}}`.
- Upgrade the visual treatment per the loaded style preset without losing the recognizable silhouettes, palettes, and iconography of `{{SCOPE}}`.
- Choose 1–2 recurring visual motifs from `{{SCOPE}}` that should appear across multiple acts to reinforce identity (a recurring object, location, symbol, shape, or color).

---

## SCENE COVERAGE REQUIREMENTS

Plan coverage across these categories. Specifics depend on `{{SCOPE}}` and should be populated during intake.

- **Major story locations / set pieces** the audience expects to see.
- **Prominent characters:** protagonist, key allies, key antagonists, signature side characters.
- **Iconic vehicles, mounts, or modes of travel** (if applicable).
- **Iconic weapons, tools, or items.**
- **Iconic creatures, factions, or enemy types.**
- **Recurring symbolic motifs** (the 1–2 chosen above must appear at least 3 times across the trailer).

Aim for roughly `{{SCENE_COUNT}}` scenes total, distributed across acts so no act feels thin.

---

## CAMERA AND CINEMATOGRAPHY

- Vary camera angles dramatically. **No two consecutive scenes should share the same angle type.**
- Mix: extreme close-ups (eyes, hands, objects, surfaces, textures), medium shots, wide establishing shots, extreme wide shots, low angles, high/aerial shots, crane shots, tracking shots, Dutch angles, POV / over-shoulder, profile / hero shots, insert shots, two-shots.
- Some scenes can use multiple angles (e.g., wide → close cut) if it serves the cinematic feel.
- Cinematic compositions — anamorphic feel, intentional negative space, considered framing.
- **Use scale contrast** when scope allows: tiny humans against monumental architecture, vehicles, or threats.
- **Use horror framing** for any horror beats: partial reveals, silhouettes, flashlight beams, security-cam angles, claustrophobic spaces, unsteady handheld feel.
- Pull director references from `{{DIRECTOR_REFS}}`. The loaded style preset also contributes preset-appropriate director/studio anchors.
- **Vertical aspect ratio note:** if `{{ASPECT_RATIO}}` is 9:16, prefer single-subject vertical compositions, foreground/background depth, and centered hero framing. Avoid horizontal panoramas — they don't read on phones.

---

## VISUAL STYLE

`{{STYLE_PRESET_GUIDANCE}}` — substituted from the loaded style preset.

The preset defines: render style, lens/camera language, material/lighting language, color grade defaults, what to avoid, and director/studio anchors specific to that aesthetic.

Constants across all presets:
- Cinematic color grade tuned to `{{SCOPE}}`'s palette. During intake, define palette anchors: a hero color, a threat color, an environment color, and a "magic / mystery / mood" color.
- Characters, vehicles, items, and environments should retain their recognizable `{{SCOPE}}` silhouettes and proportions.
- Should look like a $200M production within the loaded preset's aesthetic, not a fan render.

---

## CRITICAL PROMPTING APPROACH

This is the most important rule of the entire workflow. The user will be uploading reference images of characters, locations, vehicles, weapons, and objects to `{{IMAGE_TOOL}}` to maintain consistency across all scenes. Therefore:

- **DO NOT describe character appearances in detail** unless absolutely necessary for action clarity. Don't over-describe faces, body types, clothing, armor, anatomy. References handle this.
- **DO use named references** (e.g., "Master Chief stands at the edge of the Silent Cartographer island," "Link draws the Master Sword inside the Temple of Time").
- **DO focus prompts on:** camera angle, shot type, lighting direction, color grade, atmospheric effects, action / pose, environment details not in the reference, mood, scale, director references.
- **DO emphasize critical physical specifics when needed:** correct grip, correct facing, faction separation, readable silhouette, grounded physics.
- **DO explicitly name vehicles, weapons, and locations** so the correct references are applied.
- **DO NOT let prompts drift into generic.** Use names. Use `{{SCOPE}}`-specific terminology.
- **DO NOT over-explain.** Long character descriptions create a tug-of-war with reference images and produce muddy hybrids. Trust the references.
- Aim for prompts around **1,000–1,500 characters each**, focused on cinematography rather than character description.

**Model sheets are canonical from Step 3 onward.** Once Step 3 produces restyled character/object model sheets, those model sheets — NOT the original online source references — become the single canonical visual source for every downstream prompt (Steps 4–6). Past projects have failed when scene prompts re-described faces, body type, armor, or signature gear in detail and ended up overriding the reference image, producing muddy hybrids. Scene prompts must trust the model sheets and never re-describe what the model sheet already shows. Refer to assets by name and reserve description for camera, lighting, action, and environment.

---

## GLOBAL CONSISTENCY NOTE

Every image prompt should end with the closing consistency line from the loaded style preset (`{{STYLE_CLOSING_LINE}}`), tuned for `{{SCOPE}}`'s palette and tone. Each prompt is submitted independently with no shared context, so phrases like "same as before" don't work — the closing line carries the cross-prompt cohesion.

---

## VOICEOVER APPROACH

- Use minimal dialogue throughout.
- Default to one of: a single character VO for emotional grounding, narrator VO for cinematic mystery, or no VO at all (music + SFX only).
- Avoid turning the trailer into a quote montage.
- Don't rely on direct script quotes from the source unless the user explicitly asks.
- Evaluate whether one or two short original lines earn their place, and justify the recommendation either way. If music and sound design serve better, say so.

---

## FRAME STRATEGY

Frame planning happens during the storyboard (Step 1), NOT after image generation. Every scene must be classified upfront so its `{{IMAGE_TOOL}}` prompt is built for the right job.

### Three frame roles per scene

For each scene, decide which role applies:

1. **SINGLE** — one image carries the full clip. Default for ambient camera moves, simple atmospheric motion (smoke, sparks, dust, rain, fog, cloth, plasma glow), tracking shots where the subject stays visually consistent, and contained single actions (a gesture, a glance, a weapon raise) that fit in one composition.

2. **PAIR — anchor on the START frame, edit forward to END.** Generate the start frame first, then use it as a reference image to edit toward the end state.

3. **PAIR — anchor on the END frame, edit backward to START.** Generate the end frame first, then use it as a reference image to edit toward the start state.

### When a scene needs a frame pair

Frame pairs are needed when:
- Major state changes occur (closed → open, calm → attack, intact → destroyed, hidden → revealed).
- Impact moments need pre-impact context.
- A reveal needs visual progression (empty → presence, dark → lit, normal → corrupted).
- Subject scale or position changes dramatically within a single shot.
- Vehicles or characters move through major spatial transitions.
- A single frame can't carry the full motion arc.

### Choosing the edit direction

Core principle: **anchor on the frame with higher visual information density and lower removal complexity, then edit toward the simpler frame.** Adding atmospheric effects to a clean frame is reliable in `{{IMAGE_TOOL}}`; cleanly removing a complex subject from a busy frame often leaves artifacts.

**Anchor on the START frame (edit FORWARD) when the change is mostly additive or atmospheric:**
- Adding explosions, sparks, smoke, fire, debris, particle effects.
- Adding glow, lighting changes, shield flashes, plasma trails, energy effects.
- Adding cracks, damage, deformation, melt, corruption to an intact subject.
- Start frame is already the cleaner "establishing" composition.
- *Examples:* reactor stable → reactor overloading; clean corridor → corridor on fire; spacecraft intact → hull breach forming; calm sky → meteor entering frame.

**Anchor on the END frame (edit BACKWARD) when the end frame is the money shot or the change is subtractive of a complex element:**
- The end state is the iconic / climactic reveal that has to be composed perfectly.
- The change involves removing a character, creature, vehicle, or major structural element.
- The start state is "before X arrived" and X is visually dense.
- The end frame carries more lighting drama, atmosphere, or signature pose worth anchoring.
- *Examples:* empty hallway → terrifying figure standing at the end (anchor on the figure); door sealed → door breached with creature emerging (anchor on the breach); calm bridge crew → captain absorbed by horror (anchor on the horror frame); peaceful meadow → dragon landed in foreground (anchor on the dragon).

**When in doubt, anchor on START.** Editing in atmospheric and damage effects is the most reliable operation in `{{IMAGE_TOOL}}`. Anchor on END only when there's a clear reason — usually because the end frame is "the shot" and the start frame is just setup.

### What this changes downstream

- **Step 1 storyboard:** every scene gets a frame role tag (SINGLE / PAIR-START / PAIR-END). Pair scenes also get a one-line direction rationale.
- **Step 4 / Step 5 image prompts:** each prompt is written for the specific anchor frame. Pair-scene prompts state explicitly which frame is being generated and that it will later seed an edit toward the other frame.
- **Step 6 edit prompts:** edit direction is pre-decided in Step 1, so this step just translates each pair into the right edit instruction.

---

## DELIVERABLES IN ORDER

Wait for approval between each step. Update `trailer_progress.md` after every approved step.

**Step 1 — Storyboard.** Full storyboard delivered as a **single dense markdown table** (not prose), so the whole trailer is scannable at the approval gate and revisions can be requested by row. Required columns, in this order:

| # | Act | Beat | Camera | Frame role | Anchor dir. | Scene description (one line) |

- `#` — scene number, sequential.
- `Act` — act 1, act 2, act 3, climax, title.
- `Beat` — short beat label (cold open, world establish, inciting threat, escalation, twist, tonal pivot, climax, title).
- `Camera` — angle/shot type (extreme close-up, wide, low angle, tracking, etc.). No two consecutive scenes share a camera type.
- `Frame role` — SINGLE / PAIR-START / PAIR-END.
- `Anchor dir.` — for PAIR scenes only, a 3–6 word rationale for the anchor choice (e.g., "anchor end — figure is the money shot"). Blank for SINGLE.
- `Scene description` — one line, ~20 words max. References named per `{{NAMING_CONVENTION}}`, no over-description.

Run the SELF-CHECK CHECKLIST below before delivering. Wait for approval.

**Step 2 — Reference asset list.** All characters, factions, locations, vehicles, weapons, and objects to gather as reference images, named in `{{NAMING_CONVENTION}}`. Group by category. **Each asset must carry a reference role tag**:
- `GENERATE` — needs a restyled model sheet produced in Step 3 (most characters, hero vehicles, signature props, key locations).
- `USE_AS_IS` — the source reference the user is supplying already matches the locked aesthetic and can be used directly.
- `SKIP` — appears once, not continuity-critical, no style risk; include a one-line rationale.

Signature props, weapons, and artifacts should be listed as their own assets in the reference list (not bundled under the character that wields them) when they're hero-significant enough to appear in multiple scenes or warrant their own dedicated prop sheet. Tag with the same `GENERATE` / `USE_AS_IS` / `SKIP` triage.

The triage drives Step 3 — only `GENERATE` assets get reference-image prompts. Wait for approval.

**Step 3 — Reference image generation prompts (model sheets).** For every Step 2 asset tagged `GENERATE`, produce a Nano Banana Pro prompt that takes the user's source reference image and re-renders it as a **clean multi-angle model sheet** in the locked aesthetic. These model sheets become the canonical visual source for Steps 4–6 — every downstream scene prompt references them, not the original source.

Use the structure in `templates/reference_prompt_template.md`. Deliver in two passes:

- **Step 3a — Single test reference prompt.** Pick the most style-defining asset (default: main protagonist; recommend a different anchor if a hero vehicle, signature creature, or iconic location would set the look better, and explain why). Deliver one labeled code block with the prompt. Above the block, state the asset name, source reference filename, and which model-sheet variant applies. Wait for the user to generate, review, and approve. Iterate on the prompt formula until the output nails palette, materials, lighting, and lens character. This iteration locks the template for the rest. If the most style-defining asset is a signature prop or vehicle rather than a character, the test prompt should follow that asset type's model-sheet rules (front + rear mandatory for vehicles; 2–3 angles for props).

- **Step 3b — Full reference-prompt CSV.** Once 3a is approved, deliver a CSV per `templates/csv_format_spec.md` covering the approved test asset plus every other `GENERATE`-tagged asset.

Also list, in chat (not in the CSV), the assets you skipped (`USE_AS_IS` and `SKIP`) and why, so nothing falls through silently.

**Model-sheet specification (applies to every Step 3 prompt):**

All reference sheets are rendered as **16:9 horizontal images** with a neutral seamless background and even, neutral key lighting so the sheet reads as reference, not a scene.

**Hard angle cap: between 2 and 4 angles per sheet.** Do NOT pack more — Nano Banana Pro distorts proportions and faces when it tries to fit too many figures into a single composition. Fewer, cleaner angles produce sharper references than crowded ones.

- **Characters / creatures:** 2–4 angles. **Front and back are mandatory.** Optional additions: 3/4 hero angle, profile/side. Pick the angles that matter for downstream scene generation — if the character is mostly seen from the front in the trailer, prioritize front + 3/4 + back; if back-of-head silhouette is iconic (cape, hair, armor backplate), prioritize front + back + side.
- **Vehicles / mounts / large objects:** 2–4 angles. **Front and rear are mandatory.** Optional additions: side, 3/4. Same 16:9 sheet, same neutral treatment.
- **Environments / locations:** 2–3 "key views" — wide establishing, mid, and a signature detail. 16:9. Time-of-day and mood should match the trailer's primary act usage of the location.
- **Signature props / weapons / gadgets / artifacts:** each hero-significant item gets its **own dedicated prop sheet** (separate generation from the character sheet). 2–3 angles per prop on a neutral background. Examples: hero weapon displayed off-character at multiple angles, signature helmet on a stand, iconic artifact rotated. Do NOT cram these onto the character sheet.

**Anti-override guardrail.** The most common past failure has been prompts that over-describe characters and end up overriding the reference image. The same risk exists *inside* Step 3 — if a restyle prompt re-describes the face, body, or armor in detail, Nano Banana Pro will drift away from the source ref and produce a different character. Step 3 prompts must trust the source reference for everything being preserved and only specify what's being changed (palette/materials/lighting) or newly composed (the model-sheet angles, the neutral background).

Wait for approval after 3b before moving to Step 4.

**Step 4 — Test prompts (3 scenes).** Three differentiated test scenes to validate the scene-prompt formula before committing to the full batch. **Test prompts must cover all three frame roles** so we validate each prompt style:
- One **SINGLE** frame scene (any scene type).
- One **PAIR-START** scene (anchor frame to be edited forward).
- One **PAIR-END** scene (anchor frame to be edited backward).

Present each test prompt in a code block, with a chat-level label ABOVE it stating scene number, frame role, and for pair scenes the edit direction. **The frame role label stays outside the prompt text** — the prompt itself is pure cinematography content, matching the Step 5 production format. The role still drives how the prompt is composed: PAIR-START frames reserve visual space for what'll be added later, PAIR-END frames render the climactic state with complex elements present, SINGLE frames are self-contained. Include the reference list above each prompt as well. Wait for feedback.

**Step 5 — Full prompt CSV.** Once test prompts land, generate all remaining prompts as a downloadable CSV per `templates/csv_format_spec.md`.

Each prompt is still **composed** for its specific frame role (decided in Step 1). PAIR-START prompts reserve visual space for what'll be added later; PAIR-END prompts render the climactic moment with all complex elements present; SINGLE prompts are self-contained. The role shapes prompt content but does not appear as a column.

**Alongside the CSV, deliver a companion frame-role reference table** as a markdown table in chat (NOT in the CSV, NOT a separate file unless requested). Columns: scene number, scene title, frame role, edit direction note. This is the user's tracking reference for Step 6 — it is not uploaded to the bulk tool.

**Step 6 — Frame pair edit prompts.** After the user generates all anchor-frame images, deliver image-EDIT prompts (not new generation prompts) to produce the second frame in each pair. Edit direction was already decided in Step 1, so this step just translates each pair's direction note into a clean `{{IMAGE_TOOL}}` edit instruction that preserves visual consistency with the anchor. Deliver as a CSV per `templates/csv_format_spec.md`.

**Step 7 — Animation prompt CSV.** Once images and frame pairs are complete, provide `{{VIDEO_TOOL}}` animation prompts as a downloadable CSV per `templates/csv_format_spec.md`. Animation prompts focus on camera motion, subject motion, ambient motion, pacing — short and motion-focused, around 400–600 characters each. Pay attention to:
- Weight and speed of any vehicles or large creatures.
- Impact physics (projectile hits, shield flashes, debris).
- Threat motion language (slow / dread vs. fast / twitchy / unnatural).
- Massive environments feeling still and monumental, not jittery.
- Scale moments (huge subjects) using slow parallax and sky movement, not random motion.

**Step 8 — Audio plan.** Music recommendation, generation prompt formatted for `{{AUDIO_TOOL}}`'s style field with comma-separated descriptors, and full audio storyboard mapping music drops, impact hits, sound design moments, and ambient layers to specific scenes. Tune all audio anchors to `{{SCOPE}}`'s sonic identity (signature instruments, vocal styles, ambient textures, leitmotifs associated with the IP). Consider whether the trailer benefits from multiple music sections (ambient intro, action build, breakdown / horror beat, apocalyptic climax).

---

## GENERAL OPERATING PRINCIPLES

- Think carefully and iterate — quality over speed.
- Push back with reasoning when something can be improved instead of silently executing.
- Use `{{NAMING_CONVENTION}}` consistently.
- Provide individual code blocks for prompts the user can copy-paste easily, when not delivered via CSV.
- Self-check work before delivering.
- Ask clarifying questions when needed but don't over-ask. Make smart recommendations and explain reasoning.

---

## SELF-CHECK CHECKLIST

Run before each deliverable:

- **Camera angle variety** — no two consecutive scenes share an angle type.
- **Frame strategy** — every scene has a frame role; pair scenes have a defensible anchor direction; ratio of pairs to singles feels reasonable (typically 30–50% pairs in an action-heavy trailer, less in a slower one).
- **Recurring motif** — does the chosen visual motif appear across multiple acts?
- **Scope fidelity** — does every element belong to `{{SCOPE}}`, not later or earlier installments? Does anything from `{{EXCLUDE_LIST}}` slip in?
- **Tone fidelity** — does the visual and audio language match `{{GENRE}}` and `{{ARC}}`?
- **Aspect ratio fit** — do the compositions read in `{{ASPECT_RATIO}}`?
- **Reference discipline** — are prompts trusting reference images instead of over-describing?
- **Pacing** — does the act structure escalate, breathe, and climax appropriately?
- **Trailer ending** — is there a clear hook, twist, climax, and title moment?
- **Rating fit** — does intensity match `{{RATING}}`?
- **Reference coherence** — do the Step 3 model sheets share lighting direction, palette anchors, lens character, and material treatment so the assets read as one film when composed together? Are scene prompts (Steps 4–6) trusting the model sheets rather than re-describing what's already in them?
- **CSV integrity** — when delivering any CSV (Steps 3b, 5, 6, 7), read back the output and verify: column count matches the spec for that step, no header row, no extra metadata columns, no stray commas inside unquoted fields, no smart quotes. Bulk-generation tools fail silently on malformed CSVs — the self-check is non-negotiable before delivery.
- **Style preset adherence** — do the prompts follow the loaded preset's render-style line, lens language, color grade defaults, and "what to avoid" rules?

---

## COMMON FAILURE MODES TO AVOID

- **Muddy character hybrids** from over-describing faces / armor / outfits in prompts when references would handle it.
- **Generic sci-fi / fantasy soldier drift** when the protagonist's name and reference aren't anchoring the prompt.
- **Era leakage** — accidentally including elements from later or earlier installments of the franchise.
- **Quote-montage trailers** that lean on remembered lines instead of building emotion.
- **Flat camera language** — defaulting to medium shots and never using extreme close-ups, low angles, scale shots, or Dutch angles.
- **Composition that ignores aspect ratio** — wide horizontal panoramas in 9:16, or claustrophobic tight verticals in 16:9.
- **Music that doesn't escalate** — single-mood scoring that never pivots with the trailer's emotional arc.
- **Ambient motion mistaken for storytelling motion** — animation that just "moves a little" instead of carrying the shot.
- **Style drift across model sheets** — generated references that don't share lighting direction, palette, or lens character, producing assets that look like they belong to different films.

---

End of master workflow.
