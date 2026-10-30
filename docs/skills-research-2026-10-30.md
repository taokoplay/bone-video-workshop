# Public screenplay and video skills research — 2026-10-30

## Method and limits

This research informed Bone 0.21.0 before implementation. Search covered
screenwriting, storyboard skills, Chinese manju/short-drama skills and video
production. Repository popularity below is an observed GitHub API star count,
not skill-install count, an exhaustive ranking or artistic-quality evidence.
Counts change; samples were collected approximately 05:48–06:00 UTC, with the
three shallow-checkout repositories' metadata rechecked at 06:23 UTC.

Read actual SKILL.md files and selected references/templates, not just search
snippets. Public files were downloaded into session scratch only; no third-party
scripts were executed or skills installed. The AutoGLM local token endpoint was
unavailable; unauthenticated GitHub API later rate-limited. GitHub raw files,
shallow checkouts and `gh api` supplied the evidence. Six remotely fetched
repositories have pinned commits/blob verification; three smaller repositories
were read at their shallow-checkout commits. Source code/runtime rendering
claims of these third-party projects were not independently tested.

The selected set contains 9 repositories. Reading a focused part of a large
repository is not a complete audit of that repository.

## Observed sources and popularity

| Repository | Stars observed | Version sampled | License checked |
|---|---:|---|---|
| [OpenMontage](https://github.com/calesthio/OpenMontage) | 73,087 | `195eab24478dc9363326aec437aefc3701635ddf` | Root AGPLv3; bundled items vary |
| [video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) | 14,849 | `1266a3ec4831289c4d893d42dd5102723658039a` | Apache-2.0 code/docs; media and Remotion terms separate |
| [shuohao-skills](https://github.com/eternityspring/shuohao-skills) | 5,702 | `5612d2a0bd5f19d978c3ee19d1e42840335e3b4b` | Apache-2.0 |
| [drama-skills](https://github.com/zenstory-ai/drama-skills) | 3,533 | `d633e67c927d25bbc3185e44a0f819b6ee352b04` | MIT |
| [screenwriting-skills](https://github.com/jtydhr88/screenwriting-skills) | 1,884 | `51115f18d160aa8b2ac5813e4432b6f0b425358f` | MIT original organization; NOTICE excludes third-party quotations |
| [manju-laoli-skill](https://github.com/lixiaoxiao9888-create/manju-laoli-skill) | 1,772 | `6f16955c57053d77ea0ffbdbbf3a7985a3e0080a` | MIT |
| [short-drama](https://github.com/0xsline/short-drama) | 1,520 | `8979a428c31a865421d661bdb606e24314b683a0` | MIT |
| [script-to-shootable-storyboard](https://github.com/zyz254009-crypto/script-to-shootable-storyboard) | 119 | `e1ee698cf5cc94b035560937540134fb7bdb0a07` | MIT |
| [screenwriter-skill](https://github.com/Vi7QY/screenwriter-skill) | 93 | `cf22b2358c017dd901a38c91e1964e320a2e5282` | MIT |

The last two were selected for task fit, not described as the most popular.
Catalog-only repositories and unrelated search matches were not used as craft
evidence. No market-success claim or repository self-description proves that
its generated scripts are professional or its final video quality is validated.

## 1. Screenwriting Skills: dramatic diagnosis and revision sequence

Sources: [workflow](https://github.com/jtydhr88/screenwriting-skills/blob/51115f18d160aa8b2ac5813e4432b6f0b425358f/plugins/screenwriting/skills/sw-workflow/SKILL.md),
[workflow template](https://github.com/jtydhr88/screenwriting-skills/blob/51115f18d160aa8b2ac5813e4432b6f0b425358f/plugins/screenwriting/skills/sw-workflow/reference.md),
[scene craft](https://github.com/jtydhr88/screenwriting-skills/blob/51115f18d160aa8b2ac5813e4432b6f0b425358f/plugins/screenwriting/skills/sw-scene-craft/SKILL.md),
[character/conflict](https://github.com/jtydhr88/screenwriting-skills/blob/51115f18d160aa8b2ac5813e4432b6f0b425358f/plugins/screenwriting/skills/sw-character-conflict/SKILL.md).

Observed: premise → structure → character/conflict → scene outline → draft →
revision → submission. Scene rows name location/time, action/result, opening and
closing value, structural position and who wants/blocks/wins. Revision findings
identify a checklist question, scene/page, problem and suggestion. Parallel
reviewers are instructed to read only; the primary writer owns changes.

Adopt: scene objective, tactic, resistance, observable consequence; find the
first missing cause before polishing dialogue; retain stable IDs and decisions.
Do not adopt blanket scene deletion for every missing value reversal, fixed card
counts, psychological archetypes, or book quotations. A quiet scene can establish
space, contrast or an emotional consequence. User authorization still needs an
explicit distinction from the act of receiving reviewer feedback.

## 2. Drama Skills: strong separation of review, writing and production

Sources: [writing](https://github.com/zenstory-ai/drama-skills/blob/d633e67c927d25bbc3185e44a0f819b6ee352b04/skills/short-drama-write/SKILL.md),
[review](https://github.com/zenstory-ai/drama-skills/blob/d633e67c927d25bbc3185e44a0f819b6ee352b04/skills/short-drama-review/SKILL.md),
[editing](https://github.com/zenstory-ai/drama-skills/blob/d633e67c927d25bbc3185e44a0f819b6ee352b04/skills/short-drama-edit/SKILL.md).

Observed: writing starts from the episode's promised experience and entry/exit
facts. It distinguishes original authors' text from generated first drafts;
normalization is not permission to rewrite. Findings contain location, evidence,
impact, expected repair, responsible stage and severity. Review writes findings,
not source files. Editing first inspects full sources, finds usable bands, then
selects narrative in/out points with a reason for each. Missing versus unusable
footage are separate causes. Technical rendering is not quality approval.

Adopt: mode separation, traceable findings, preserve authorial voice, actionable
cut reasons and explicit unverified evidence. Do not replace Bone's native
prose/beats/assets with the source's five Markdown documents or import its
specific renderer/export assumptions. Use Bone tool fields as the single saved
source of truth; companion reports only expand evidence.

## 3. Shuohao: stage boundaries and explicit opening blocking

Sources: [novel-script](https://github.com/eternityspring/shuohao-skills/blob/5612d2a0bd5f19d978c3ee19d1e42840335e3b4b/skills/novel-script/SKILL.md),
[novel-staging](https://github.com/eternityspring/shuohao-skills/blob/5612d2a0bd5f19d978c3ee19d1e42840335e3b4b/skills/novel-staging/SKILL.md).

Observed: screenplay separates action beats and speaker/text/delivery lines;
its checks compare characters, scene, lighting and props with upstream records.
Staging is a separate step before storyboarding, specifying presence, location
relative to an item, facing, posture, extras and rationale. World directions are
not screen directions. Scene-image observations are distinguished from prompt-
based guesses. The skill explicitly notes that storyboard does not automatically
consume the staging JSON: transfer still requires a real handoff.

Adopt: check scene entry state before camera instructions, track off-screen and
later-entering characters, compare exact dialogue/speaker and declared timing
assumptions. Do not copy mandatory item counts,35-character dialogue limits,
fixed2.5-second action-beat estimates,15% timing tolerance or claims that certain
AI actions always fail. Keep complete Bone prose; extracted line sheets and
blocking tables support it, not substitute another contradictory screenplay.

## 4. Manju Laoli: source authority and review-only boundary

Source: [sd-script-engine](https://github.com/lixiaoxiao9888-create/manju-laoli-skill/blob/6f16955c57053d77ea0ffbdbbf3a7985a3e0080a/sd-script-engine/SKILL.md).
The large director entry was fetched for traceability, not read fully or treated
as fully audited. Conclusions here come from the script engine's actual body.

Observed: source registration → character/IP → bible → episode planning → full
screenplay → review → explicitly selected refinement. Labels separate FACT,
INFERENCE, ASSUMPTION, USER_OVERRIDE and OPEN_ITEM. External screenplay polish
can add performance/blocking while preserving facts. The engine distinguishes
source facts from reviewer preferences and requires prior exit state, unfulfilled
promises and the next episode's first action at batch handoff.

Adopt: facts/proposals separation, keep original source above market formula,
review is not rewrite authorization, changed upstream information needs a new
check. Do not import mandatory multi-agent roundtable debates, audience-role
simulations presented as actual audience research, grading/consensus as quality
certification, repeated confirmations when authorization already exists, or
all13 skills as always-loaded prompt context.

## 5. Script-to-Shootable Storyboard: explicit change scope and three-shot repair

Sources: [SKILL](https://github.com/zyz254009-crypto/script-to-shootable-storyboard/blob/e1ee698cf5cc94b035560937540134fb7bdb0a07/SKILL.md),
[iterative refinement](https://github.com/zyz254009-crypto/script-to-shootable-storyboard/blob/e1ee698cf5cc94b035560937540134fb7bdb0a07/references/iterative-storyboard-refinement.md).

Observed: faithful/visual/pacing/story permissions; freeze original, stable facts,
assumptions and scope before revision. Diagnose cause at story/information,
scene/beat, blocking, shot/edit, sound/timing, generation/assembly layers. Use
previous-current-next evidence window. Preserve IDs; stage minimal patches;
recheck affected downstream objects. A shot normally has one continuous action
unit and camera intention; intentional long takes need a justified exception.

Adopt: explicit revision intent, staged changes, before/after comparison,
neighbor impacts, and minimal repairs. Do not blindly copy its model registry,
exact one-shot/one-task convention or static target-duration restrictions;
Bone separates edit budget and source handles and supports multiple selections.
Mechanical schema pass cannot certify faithful interpretation of a story.

## 6. Short Drama: useful organization, unsuitable universal numerical rules

Source: [SKILL](https://github.com/0xsline/short-drama/blob/8979a428c31a865421d661bdb606e24314b683a0/SKILL.md).

Observed: plan/characters/outline/episode/review/export stages, persistent progress,
scene-heading/dialogue templates, cross-episode callbacks and prioritized issues.
It defaults to50–100 episodes,3–5 scenes and800 Chinese characters per episode,
plus fixed paywall/turn percentages and a numeric review score.

Adopt: recover saved progress, consistent deliverables and episode handoffs.
Do not impose its commercial scale, word quotas or numerical pass threshold on
one-minute fantasy, films, image works or promos. Timing remains performance-
based and explicit user constraints take precedence.

## 7. Screenwriter Skill: execution must be visible, but genre assumptions vary

Source: [SKILL](https://github.com/Vi7QY/screenwriter-skill/blob/cf22b2358c017dd901a38c91e1964e320a2e5282/SKILL.md).

Observed: selection/premise review, first-episode review, then revision advice;
checks character dossier traits against actual scenes and promised emotional
payoffs against their execution. State changes such as amnesia must have rules.

Adopt: a good profile is not proof the character is dramatized; each criticism
must point to a scene/line/action. Do not import universal black-and-white camps,
required positive revenge payoff, forced romance/sexualization, gender-binary
market assumptions or 'all audience must know everything by episode three'.
Its professional-experience claim is author self-description, not verified here.

## 8. OpenMontage: typed production artifacts, with contradictory fallbacks

Sources: [script director](https://github.com/calesthio/OpenMontage/blob/195eab24478dc9363326aec437aefc3701635ddf/skills/pipelines/cinematic/script-director.md),
[scene director](https://github.com/calesthio/OpenMontage/blob/195eab24478dc9363326aec437aefc3701635ddf/skills/pipelines/cinematic/scene-director.md),
[reviewer](https://github.com/calesthio/OpenMontage/blob/195eab24478dc9363326aec437aefc3701635ddf/skills/meta/reviewer.md).

Observed: ordered subject motion, identity, scene/POV/time, spatial framing and
camera parameters; graphic overlays separate from scene objects. Review checks
schema, stage focus, style and evidence. Some stage prompts require human gates.
However the reviewer contains a two-round fallback that proceeds with warnings
despite critical findings, while final-review sections prohibit failed delivery.

Adopt: typed production inputs and separate overlays; retain evidence boundaries.
Reject fail-open fallback, unconditional overwrites, automatic installation and
trailer pacing as universal character-drama structure. Missing evidence remains
unverified; review retries never convert a failure into approval automatically.

## 9. Video Shotcraft: task scope and evidence-oriented repair routing

Sources: [SKILL](https://github.com/Vincentwei1021/video-shotcraft/blob/1266a3ec4831289c4d893d42dd5102723658039a/SKILL.md),
[pipeline](https://github.com/Vincentwei1021/video-shotcraft/blob/1266a3ec4831289c4d893d42dd5102723658039a/references/pipeline.md),
[final review](https://github.com/Vincentwei1021/video-shotcraft/blob/1266a3ec4831289c4d893d42dd5102723658039a/references/final-review.md).

Observed: autonomous/collaborative modes, prior authorization persists; candidate-
only SFX work excludes downloads, renders and picture changes. Storyboard errors,
visual implementation errors and sound errors return to their owner stage.
Final review cites frames and a baseline, marks missing evidence unverifiable,
and distinguishes mandatory correction from advice.

Adopt: task-scope discipline, actual evidence and repair routing. Do not impose
product-promo beat cuts, captions, shot recipes or exact hold times on dramatic
scenes; do not claim its Remotion/CapCut export paths already exist in Bone.

## Synthesis implemented for Bone

| Research finding | Bone adaptation | Acceptance evidence needed |
|---|---|---|
| Review is distinct from writing | Explicit review-only/propose/apply modes; no rewrite triggered by needs-revision | Stage plan leaves creative fields unchanged |
| Preserve source and author intent | Instruction, preservation commitments, per-change reason/issue and criterion | Exact before/after, IDs retained, unknown fields rejected |
| Stable baseline before repair | Host-captured before values and content/version guards | Concurrent/stale edits reject atomically |
| Visual vs pacing vs story are different | Conservative allowlisted field sets and visible intent | Wrong intent/field combinations reject; semantic limits documented |
| Minimal repair plus neighbors | Affected shots/episodes and adjacent-shot recheck list | Unrelated objects/media remain untouched |
| Reversible revision | Conditional restore of the applied field set, monotonic revisions | Restore blocks intervening edits and never revives old media approval |
| Scene/blocking/voice checks | Expanded stage-specific prompt rubrics, genre and production branches | Manual scenario evaluation plus integration fixtures; no claimed taste score |
| User choice is not software-generated | Separate apply/restore tools requiring explicit confirmation and instruction reference | Host approval remains; Agent assertion is not certified user consent |

Source methods are independently synthesized into Bone instructions and code;
no external source code, long passages, book quotations, assets or runtime
scripts are bundled. License observations above are not a license audit of all
upstream dependencies. This study does not establish media/voice/likeness rights.

## Deliberate limits

No new automatic image/video generation, complete NLE/export, screenplay semantic
solver or audience-performance prediction. Existing direct write tools remain
compatible; the skill and UI route review-driven rewrites through staged plans,
but the new tools are not a security sandbox that prevents every old write call.
