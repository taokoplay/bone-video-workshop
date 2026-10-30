# Script breakdown prompt

Use after a complete screenplay exists to populate structured `beats` (脚本).
Read the actual episode prose and its scene labels, approved episode outline,
relevant rules and existing beats/shot mappings. For a single-shot revision,
read only its source scene and necessary adjacent context.

## Assignment

Act as the script editor translating the screenplay into production units.
Preserve its causal sequence, events and exact dialogue intent. Do not write a
second, contradictory story during breakdown. If a major event is missing from
the prose, repair that source within the authorized scope before inventing it
in a beat or shot. Report the source change and affected downstream work.

## Deliverable: beats plus a source map

Choose beat boundaries where objective, tactic, conflict, knowledge or outcome
changes. A scene can contain several beats; a beat can need several shots.
Do not enforce one beat per scene or one shot per beat. Do not impose a fixed
minimum beat count independent of the work's duration and content.

For every beat, write:

| Bone field | Content |
|---|---|
| `title` | Concrete event/change; include a short source scene label when helpful |
| `purpose` | The closest supported narrative function, not an invented enum |
| `dramaticQuestion` | What the viewer is currently expecting or trying to understand |
| `synopsis` | Trigger, action, consequence and information change from the screenplay |
| `visualAction` | Observable action and performance that can communicate that change |
| `dialogue` | Dialogue intent and required line references; exact shot speech belongs in `shot.dialogue` |
| `sound` | Sound's dramatic role, source and relationship to the action |
| `continuity` | Entry/exit facts, knowledge, props, geography and relevant invariants |

Keep a compact source map in an episode companion document:
scene label -> actual beat ID -> actual shot IDs -> required event -> estimated
screen time. Never add undocumented `sceneId` or `sourceRange` tool fields.
Before tools return IDs, use editorial labels marked as such; replace/add real
IDs after saving. Record unmapped items explicitly rather than inventing IDs.

Use `write_episodes` with the existing episode ID. Its `beats` list replaces the
entire episode list: include every retained beat with its `beatId`. Preserve
existing prose and episode metadata. Existing shot mappings should be retained
by their existing beat IDs; do not try to author `shotIds` inside a beat input.
Use `add_shots`/`update_shot` with `beatId` to create or adjust those links.

## Review before storyboard

- Account for every required screenplay event and every submitted beat.
- Check causal connection rather than mere chronological adjacency.
- Verify that a reveal has a source and does not grant impossible knowledge.
- Identify where the audience can actually perceive the crucial information.
- Allocate dialogue, action and reaction time without double-counting overlap.
- Mark missing source scenes or unresolved contradictions as needs revision.

Reread the saved episode to check prose preservation and beat identity. Do not
label the screenplay artistically approved merely because all beats have text.
Handoff the source map and relevant constraints to asset/storyboard planning.
