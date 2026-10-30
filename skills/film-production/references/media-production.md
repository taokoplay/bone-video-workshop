# Frame, video and sound production prompts

Contents: [Frames](#a-first-frame--last-frame-image-prompt),
[Video](#b-video-generation-prompt), [Dialogue](#c-dialogue--voice-prompt),
[Effects and music](#d-effects--ambience--music-prompt),
[Adoption and evidence](#adoption-and-evidence-boundary).

Read the current shot, its source beat, required neighboring states, actual
reference assets and authorized generation capabilities. Use the appropriate
contract below. Do not send one undifferentiated screenplay to every model.

Before generation, record the current shot revision, intended target, inspected
reference identities, request scope, output count and acceptance criteria in
the episode companion document. Use real returned media hashes where available.
An intended instruction is not evidence that generation ran or passed review.

## A. First-frame / last-frame image prompt

Act as the frame art director. Describe one precise instant:

```text
Purpose and role: first frame / last frame; source shot and narrative moment.
Identity anchors: only relevant stable character, costume, prop and style facts.
Space: location, layout, time, key light, camera side and depth relationships.
Composition: viewpoint, shot size, subject placement, gaze and screen direction.
State: pose, hands, contact points, object ownership and visible material state.
Reference use: actual available image identities and which facts they constrain.
Must preserve: a short list of observable identity/continuity requirements.
Must avoid: specific plausible failure modes, not a generic adjective dump.
Output: required aspect ratio and supported resolution.
```

The first frame is the action's starting state, not its entire plot. Derive the
last frame from the same shot's outcome and camera plan. If the camera moves,
the endpoint perspective must change coherently. Check that both frames can
belong to the same physical action. Identical images are acceptable only for
an intentionally unchanged state, not as a shortcut for a moving action.

Inspect actual outputs against the requested states before describing them as
usable references. Register reusable asset images without shot provenance when
the tool signature permits it; adopt into the explicit frame asset. Reread the
shot revision after frame adoption before requesting its video.

## B. Video generation prompt

Act as the motion director. Describe change over time, not merely image quality:

```text
Shot purpose and edit budget: what the final selection must communicate.
Source request duration: a supported model duration with useful head/tail handles.
Starting evidence: actual first frame and supported additional references.
Action schedule: a complete ordered performance, not rushed to fit the edit budget.
Contact/intermediate state: essential interaction that must be shown clearly.
Camera: fixed or explicit movement, speed, framing and subject relationship.
Ending state: actual target frame if supported; otherwise a precise description.
Invariants: identity, costume, objects, geography, style and light constraints.
Sound responsibility: required embedded audio or explicitly separate production.
Failure checks: missing action, changed hands/props, teleports, unplanned cuts.
```

Adapt to the available generator's actual duration, frame-conditioning and audio
capabilities. If it cannot execute the plan, propose a minimal change rather
than silently remove a required action. Separate generation length from the
usable edit interval. A pan over a still image is not performed character action.

After generation inspect the real clip over the required motion and transition
intervals. First/last frames alone cannot verify the action between them.
Register the actual file with the revision captured before generation; if that
revision is no longer current, reconcile the change rather than forcing adoption.

## C. Dialogue / voice prompt

Separate **text to speak** from **performance direction** so TTS does not read
stage directions. Preserve exact approved wording and identify each speaker.
Specify stable voice traits, intention, emotion, pace, emphasis, pauses,
pronunciation and the desired timing window. Avoid contradictory emotional cues.

Distinguish in-frame dialogue, off-screen dialogue, inner voice and narration.
Only visible speaking requires lip synchronization. Check measured generated
speech against the shot window; a speaking-rate estimate is not proof of fit.
Do not rewrite approved lines to shorten them without scope to do so.

## D. Effects / ambience / music prompt

List each source, narrative function, acoustic space, distance, perspective,
onset/offset, synchronization event and cross-cut behavior. Separate background
ambience, Foley, event effects and music. Make silence intentional. Specify
music's entry/exit and relationship to dialogue; do not let it mask essential
speech or use narration to excuse a missing visual event.

Bone retains one adopted `audio` slot per shot and now supports independent
audioTracks in an episode edit plan. Keep dialogue/ambience/effects/music sources
identifiable, inspect their real lengths, then select source intervals and edit
start times. The browser preview plays these explicit tracks; it does not master
or export a final mix. For advanced processing use an actually available mixer.
Follow editing-review.md for persisted selections and scoped listening evidence.

## Adoption and evidence boundary

Use `register_media` then `adopt_media` with exactly one target. Unused targets
can be omitted or null; empty strings are not absence. If the exposed signature
still forces incompatible fields or rejects the call, report the concrete
mismatch once. Do not repeat the unchanged request or bypass
host permissions or edit private snapshots to manufacture completion.

Keep generated, registered, adopted, technically checked, visually reviewed
and listened-to distinct. Use the review contract for the final evidence report.
No available generator means a capability gap or an existing-file import, not
permission to substitute test-pattern footage for the user's creative scene.
