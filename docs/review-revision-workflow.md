# Review and revision contract (0.21.0)

Research-informed extension of the existing Bone Agent-first plugin. All actual
production changes go through plugin tools. A request to improve the plugin is
not permission to rewrite a work. Never infer rewrite permission from a review
verdict. Respect explicit prior user authorization without repeatedly asking.

## Scope and trust boundary

Keep record_review as the evidence review tool; save_revision_plan stages a
concrete proposal only. Applying a proposal is a distinct medium-risk host
approved tool with explicit confirm + authorization text supplied by Agent.
Those fields are an Agent assertion about the current user instruction, NOT
independently authenticated consent. Existing host permission checks remain
mandatory. Do not claim a security sandbox against a malicious Agent. Old direct
editing tools remain backward compatible and are not gated by a hidden mode.
Skill/panel instructions use the staged path for review-driven rewrites.

## New persistent state

snapshot.revisionPlans: array, absent in old snapshots, max 40 proposals retained.
No read mutates storage. Every saved record immutable except lifecycle application
metadata. No auto deletion, pruning, migration or guessed ID mapping.
snapshot.reviewInvalidations is an optional map from review ID to the first
production revision that invalidated it during plan application/restoration.
Compare each record's dependency basis before/after the transaction, leaving
unrelated records current. This preserves immutable reviews while preventing
restored content from reviving old conclusions, including episodes with no shots.
Newly recorded reviews have new IDs and can become current after actual recheck.
Each plan stores id,title,intent (wording|visual|pacing|story), instruction,
preserve: nonempty string[], reviewIds:string[], changes, baseContentFingerprint,
baseProductionRevision, status proposed|applied|restored, impact, createdAt.
Changes include beforeExists/before/after plus original request's reason,
sourceIssue, acceptanceCriteria; baseline cells are auto-captured by host.
Public views return derived current/canApply/canRestore, statusReason and changes.
No static quality score, approved flag or assertion that a patch solves its issue.
Proposals cannot be updated in-place; stage a replacement if requirements change.

## Tools

All writes use the existing per-production mutateProduction queue, check positive
expectedProductionRevision INSIDE the queue and return commit revision. Input
objects and results must be detached. Runtime validation even on direct calls.

save_revision_plan({id,expectedProductionRevision,title,intent,instruction,
preserve:[string],reviewIds:[string],changes:[{
 targetType:'production'|'episode'|'beat'|'asset'|'shot', targetId:string|null,
 field:string, replacementJson:string, sourceIssue:string, reason:string,
 acceptanceCriteria:string
}]}) -> {id,planId,plan: public view}

replacementJson is a JSON-encoded value for one allowlisted field. Parse JSON
only; never evaluate code. Encoding allows actual text, numbers, and whole
existing plan objects without an unbounded arbitrary object schema. Label this
plainly in tool schema and examples. Bounds: max100 changes; individual JSON
value <=220000 characters; total JSON bytes of full saved record <=2MiB; string
fields follow existing limits, no truncation. targetId is null for production,
actual matching object ID otherwise. Duplicated targetType/id/field rejects.
SourceIssue is a human/editorial problem reference, not fabricated review ID.
reviewIds may be empty; if present each must be a current, not-superseded real
review in this production (use editorialStatus). Plan staging does not change
document/shotStates/media/reviews/editPlans/asset bindings, only appends a plan.
Empty changes and all-no-op proposals reject.
Lifecycle metadata also counts toward the complete-record byte limit; a transition
that would exceed it rejects atomically instead of truncating recovery history.

Allowed fields and max lengths:
production: brief 2000, arc4000, style200, voice/music2000, and explicit
projectBible.background/rules/timeline/characters20000 (one section leaf only).
No title/id/kind/fps/ratio changes in this revision workflow; old tools handle
unrelated configuration. Preserve other fields.
episode: prose200000, logline/audiencePromise/hook/turningPoint/payoff/
productionNotes2000, targetDurationSeconds positive finite <=86400. Texts live
inside episode.script. No beats-array replacement or create/delete episodes.
beat: title80 (nonempty), synopsis/visualAction/dialogue/sound/continuity/
dramaticQuestion2000, purpose one of existing enums. Resolve unique beat across
episodes, no ID/mapping edits.
asset: description2000, profile20000, imagePrompt/negativePrompt8000. Locked
assets reject staging/applying changes until deliberately handled outside this
workflow with the user's authorization; no unlock side effect.
shot: title80 nonempty, scene2000 nonempty, motion/dialogue2000,
duration finite0..600; productionPlan/videoPlan/soundDesign/continuityPlan use
existing applyPlans validators, accept null as clear. Objects are whole values,
unknown nested fields must reject. No assetIds/beatId/episodeId/outputs/mediaId,
reorder/delete/create via staged revisions in this release.

Intent field restriction (conservative mechanical restriction, not semantic proof):
wording permits episode prose/logline/audiencePromise/hook/turningPoint/payoff/productionNotes,
beat synopsis/dialogue/dramaticQuestion, shot dialogue; no project canon,
duration, assets, visual plans.
visual permits shot scene/motion/videoPlan/soundDesign/continuityPlan, asset
imagePrompt/negativePrompt; no narrative canon/prose/duration.
pacing permits shot duration/productionPlan, episode targetDurationSeconds/
productionNotes; no canon/other text.
story permits all allowlisted fields (still no locked asset or ID mutation).
Do not claim these field gates can determine whether prose changes core facts;
preserve[] and instruction are reviewer-visible commitments for Agent checking.

apply_revision_plan({id,planId,expectedProductionRevision,confirm:boolean,
authorization:string}) -> {id,planId,status,changedFields,dirtyShotIds}
Confirm true, nonblank authorization (<=4000) explicitly refers to current user
permission for target plan/work. Require proposed state, identical current
content fingerprint and same relevant current reviews from reviewIds. Fingerprint
includes document excluding revision/createdAt/updatedAt, plus all shotStates
revision counters to prevent ABA and stale generated provenance. Appending
review/plan records does not change this fingerprint; adding/editing media
bindings changes the document and therefore invalidates the content baseline.
Revalidate payload and locks before apply, build candidate clone then assign atomically.
Auto capture before values from staging already, store afterContentFingerprint,
appliedProductionRevision (incoming revision+1), authorization text, appliedAt.
Mark affected shots dirty ONCE (increment revision; preserve outputVersion and
output slots). Impact: production canon field -> all shots; episode field -> its
shots; beat field -> its mapped shots; asset -> referencing shots/plans;
shot -> itself. Report adjacent shot IDs per affected episode as neighbors to
recheck, but do not falsely say they were modified. Impacts include episodes.
Existing semantic review/edit invalidation then works naturally. Do not create
supported reviews or final delivery status during apply.

restore_revision_plan({id,planId,expectedProductionRevision,confirm,
authorization}) -> restores ONLY cells of that applied plan, iff status applied
and current afterContentFingerprint matches. Later review/plan records may remain;
any content/shot revision drift must block to avoid overwriting user changes.
Handle beforeExists false by deleting only the missing original field. Restored
content can leave empty projectBible/script container (document compatibility is
fine) or reconstruct original absence carefully. Keep reviews, media, output
versions, new inspection records. Never roll document/shot revisions backward;
mark affected shots dirty again so old media/reviews cannot revive. status restored
and immutable history; can restore only once. Reverse-order multi-plan rollback
may be refused after revision drift; document that safe limit rather than bypass.

get_revision_plan({id,planId}) -> full public view including before/after,
intent,instruction,preserve,acceptance,impact,current and lifecycle state.
Use readSnapshot, no mutations. read methods get_production returns
revisionPlans public view; workflow.revisions summary {plans:[{id,title,status,
intent,canApply,canRestore,changeCount,dirtyShotIds,neighborShotIds,statusReason}],
counts:{proposed,applied,restored,stale}}; bone.get includes snapshot + same workflow.
Panel should use public view or workflow summary and safely escaped text.

## UI and skills

Add a read-only review/revision area under configuration or project that lists
proposals and before/after by target, reason and validation criteria. Separate
copy buttons for review-only, propose-only, apply specified plan and restore
specified plan. Never auto-run writes on click; copied text includes purpose,
actual production/plan IDs and instruction to reread latest revision. Apply/restore
copy disabled for stale/ineligible plans. Display applied != reviewed/passed.
No fake authorization checkbox or claim this records the user's consent.
No automatic media generation/export/regeneration on revision.

## Required validation

In-memory service tests plus real registered tool temporary data integration:
- Stage story fix on project/episode/asset/shot without changing their contents.
- Exact before/after persisted and read; apply changes intended fields only.
- Intent restrictions, wrong IDs/fields/null/numbers/oversized values reject;
  invalid last change does not partially apply first changes.
- Locked assets, stale content, stale expected revision, outdated review source,
  repeated apply/restore and conflicting concurrent requests reject atomically.
- Dirty relevant shots once, preserve outputs/media/IDs/beat mappings; report neighbors.
- Restore fields safely, preserve histories and monotonic revisions; reject if
  later edits changed the work; do not restore past old output validity.
- Legacy snapshot no revisionPlans reads without writes.
- No-op and unbounded history reject rather than erase.
- Browser actual copy/diff, safe text, empty state, stale disabled actions,
  post-apply status and both themes widths.
