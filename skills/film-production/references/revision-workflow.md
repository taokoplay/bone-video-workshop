# Task routing and professional revision protocol

## Identify the object before selecting a tool

The subject can be the **plugin/software workflow**, a **creative production**,
a **draft/proposal**, or **actual media**. Read the current request together with
prior steering. A production used as an example in a plugin discussion is NOT
a production-edit authorization. If the user asks to improve this plugin, edit
plugin code/skills and isolated fixtures only; do not invoke production write
tools against their real work. Do not roll back earlier production content
unless the user has explicitly authorized that restoration.

When the user says only "optimize" after discussing plugin behavior, keep the
plugin as the subject. When context points to a specific work and an explicitly
requested rewrite, proceed within that scope. If the two interpretations would
change real user data and context does not resolve them, complete read-only
analysis and ask one focused clarification before dependent writes.

## Select an operation, not a persona

| User intent | Allowed outcome | Not implied |
|---|---|---|
| Inspect/review/does it meet requirements | Read; report evidence; record_review when requested/implied | Rewriting prose, rules, assets or shots |
| Suggest improvements/show a revision plan | Analyze; save_revision_plan with concrete before/after | Applying the proposal |
| Rewrite this work/apply this named proposal | Stage, read diff, apply within existing explicit authority, reread/review | New premise, unrelated episodes, paid generation |
| Restore this applied plan | Verify restore eligibility and restore_revision_plan | Overwriting subsequent unrelated edits |
| Improve the plugin | Plugin implementation/tests/docs with isolated fixtures | Mutating an example production |

State subject, operation, scope and invariants briefly before writes. Existing
explicit user permission persists. Do not add repeated confirmation checkpoints
for already authorized reversible steps. Review feedback and a `needs-revision`
verdict never grant rewrite permission by themselves.

## Classify the permissible change

- `wording`: episode text, selected beat text and shot dialogue. Preserve facts,
  intent, information order and actor delivery. A wording label does not make a
  substantive story change harmless; read the actual diff.
- `visual`: shot scene/motion/video/sound/continuity plan, asset image prompts.
  Make existing action visible, preserve story facts, timing and character goals.
- `pacing`: shot duration/productionPlan and episode target/productionNotes.
  Keep causality and required events. A new episode target still needs user scope.
- `story`: coordinated changes across allowlisted project, episode, beat, asset
  and shot fields. Only use when requested changes need that scope. List what
  must remain unchanged and any proposed new fact clearly.

These intents restrict fields mechanically; they do not certify preservation
of meaning. For a repair spanning multiple classes, use a clearly scoped story
proposal only when that scope is authorized; otherwise stage smaller proposals
or report the decision needed. Never relabel a story change to bypass scope.

## Review -> proposal -> application -> verification

1. Read current production, workflow and full relevant sources. Read complete
   episode prose for episode-wide review; local work uses previous/current/next
   scene or shot, plus applicable canon/character state. Do not treat old chat
   summaries as the saved baseline.
2. Diagnose the earliest responsible layer: premise/rules/knowledge -> episode
   causal change -> scene/blocking -> shot/action coverage -> source/edit -> sound.
   A downstream prompt cannot fix a missing upstream story event.
3. Write findings with source location, observable evidence, impact, severity,
   exact desired outcome, preserved facts and a verification method. Distinguish
   facts, interpretations, proposals and unknowns; do not promote advice to canon.
4. If only review was requested, stop after conclusions and record_review. Do not
   rewrite `productionNotes` merely to store a review when a review tool exists.
5. If a proposal is requested or a rewrite is authorized, use save_revision_plan.
   Changes refer to real existing IDs and one allowlisted field each. Include
   reason, sourceIssue and acceptanceCriteria for every change. `replacementJson`
   is JSON encoding of the replacement value, not JavaScript or tool-call code.
   Text examples include JSON quotes; numeric budgets remain numbers after parse.
   Existing values are captured by the host, not invented by the Agent.
6. Read get_revision_plan. Compare before/after, preserved requirements, impacted
   shots and neighboring checks. Preserve useful author phrasing and existing
   profile content; do not replace a full dossier with only a newly found detail.
7. If authorized for this work/proposal, call apply_revision_plan with fresh
   expectedProductionRevision, confirm:true and a truthful reference to the user's
   instruction. If authorization is absent, leave the proposal unapplied and
   present it. Never write a fake authorization phrase to satisfy a schema.
8. Reread every changed field and report exact saved IDs/budgets. Verify the same
   evidence window against each acceptance criterion; check neighbors, dialogue,
   source coverage and downstream edits/reviews. Record a new review, including
   unresolved findings. Applied means saved, not reviewed or production-ready.

A stale proposal must be rebased by reading current content and staging a new
proposal; do not blindly resubmit with a higher expected revision. Host snapshot
history captures proposal differences, but ongoing user edits must not be lost.

## Recovery and current boundaries

restore_revision_plan requires explicit user intent, a currently eligible applied
plan and a fresh production revision. It restores the plan's fields while
preserving review/media history and increasing affected shot revisions. It
rejects intervening content changes. This is conditional recovery, not a merge
engine, branch history or arbitrary time travel. Do not silently overwrite a
later user edit to make rollback succeed.
Old conclusions invalidated by the revision remain stale after restoration,
including text reviews before any shots exist. Record a fresh review after
checking the restored material; restored wording alone does not renew evidence.

Current staged changes target existing production/episode/beat/asset/shot fields.
They do not insert/delete/reorder objects or change media bindings. Such broader
operations need separately scoped existing tools and an explicit mapping/recovery
plan; do not claim the revision transaction covered them. Locked assets are not
unlocked automatically. No tool application authorizes media generation/export.

The authorization text and confirm flag are Agent-supplied assertions. Host
permission remains authoritative; the plugin cannot independently verify that
user consent exists in another conversation. Existing direct editing tools remain
compatible, so this protocol is not a sandbox against arbitrary Agent writes.

## Stop on evidence, not iteration count

Revise once within the requested scope, rerun affected checks, and stop when the
concrete issues are resolved. If another pass is needed, explain the remaining
cause; do not manufacture new objections or whole-script rewrites for style.
No number of failed attempts can turn a blocker into a pass. Do not simulate a
panel of viewers and present it as audience research or independent human review.
When actual footage/voice is absent, finish the text review but leave media and
cut quality unverified. Report saved work, changed scope, supported checks and
remaining production work separately.
