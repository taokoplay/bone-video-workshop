# Series planning prompt

Use after project development for a multi-episode work, or when restructuring
its episode order. Read the current bible, series arc, all existing episode
summaries and the latest continuity/knowledge state. Preserve completed episode
facts unless the user requested changing them. Write in the user's language.

## Assignment

Act as the series story editor. Design the whole season's causal progression
before expanding individual episode screenplays. Determine why the story needs
the proposed number of episodes and what irreversibly changes in each one.
An episode list with a title and a teaser per row is not a series plan.

For a long series, map all episodes at outline level, then detail the current
story block. Do not claim future episodes are written because they have rows
in the plan. Do not silently change the requested episode count or duration.

When continuing, consume the last accepted exit state rather than restart the
world. Track the next episode's first necessary action, unresolved question,
knowledge changes and immediate physical circumstances. Use small practical
writing batches for feedback, but never call future outline rows finished prose.
Do not impose commercial paywall percentages, fixed episode counts or a reveal
deadline not present in the brief. Read revision-workflow.md before revising
an existing arc; a reviewer suggestion does not outrank source facts.

## Deliverable: series-plan.md

Include a season overview and one substantive entry for every planned episode:

- Episode editorial label, title, target duration and position in the arc.
- Entry state inherited from the previous episode: relationships, location,
  elapsed story time, resources, injuries and unresolved consequences.
- Protagonist's concrete goal, opposition, tactics and cost of failure.
- Causal sequence: a choice/action produces a consequence, which forces the
  next choice. Include setup, escalation, turning point and episode result
  where the story calls for them; do not enforce a fixed beat quota.
- Information progression: what is disclosed, who learns it, source of that
  knowledge, audience expectation and any justified misdirection.
- Character/relationship change and contribution to the season arc.
- Setup paid off in this episode and any new setup introduced.
- Exit state and the concrete cause of the next episode. Resolve the local
  promise before adding a continuation question where appropriate.
- Likely scene groups, major production demands and rough time allocation.

Maintain three cross-episode ledgers:

| Ledger | Required information |
|---|---|
| Setup/payoff | ID, planted detail, episode/scene, interpretation then, planned payoff, causal basis, status |
| Knowledge/revelation | Fact ID, world truth, character/audience, discovery episode, source, resulting choice |
| Continuity | Episode entry/exit, time elapsed, location, possessions, injuries, alliances and open consequences |

For nonlinear stories also map presentation order to world chronology. A reveal
changes the audience's understanding; it does not retroactively change the
world's facts unless that is an established mechanic.

## Review before handoff

Ask of each episode: if removed, what essential causal, emotional or information
change is lost? Merge or redesign redundant material as a proposal, preserving
user constraints. Check repeated cliffhangers, delayed answers with no progress,
characters acting on future knowledge and twists without planted evidence.

Check the complete arc for unresolved planted promises, implausible escalation,
repetitive character resets and an ending requiring unexplained new rules.
Do not require suspense mechanics in romance, comedy or observational work;
use the genre's actual audience promise.

Persist the plan as a companion document. Keep the cross-episode summary in
`arc`. When the user asks to write an episode, pass its complete outline,
relevant bible sections and predecessor exit state to the screenplay stage.
Create an episode with `write_script` when saving its actual screenplay;
do not fill `prose` with the outline merely to make workflow status look ready.
