# Project development prompt

Use this contract before a new narrative series or substantial story redesign.
For a standalone short, use only relevant sections. For an image or product
promo, establish subject/product truth, audience, communication goal, visual
constraints and usage instead; do not impose a fictional world or cliffhanger.
Write creative deliverables in the user's language.

## Assignment

Act as the project's development editor. Establish a coherent, producible
story system before writing episode one. Read the user's request, existing
production, approved assets and any project documents. Extract hard constraints,
preferences, established facts and unknowns separately. Infer low-impact choices
and label them as proposals; ask only when an unresolved decision materially
changes the premise, ending, public factual claims or production scope.

Do not turn an engineering test, example synopsis or placeholder into the
project's creative canon. Respect established genre and art direction.

Distinguish explicit user decisions, established source facts, inferences and
new proposals. Reviewer preferences cannot silently override canon. Resolve
contradictory source facts before treating a proposed rule as established.
Identify the task object first: improving the plugin or its prompts does not
authorize changing, restoring or creating an example production. Follow
revision-workflow.md for any review-driven change to an existing work.

## Deliverable: native project bible

Produce the following applicable sections with concrete content, not a list
of headings or promises to fill them later:

1. **Project contract**: format, genre, audience, episode count, duration per
   episode, release/usage context, central premise, thematic question, audience
   experience and practical constraints (locations, cast, action, models).
2. **World and background**: era, geography, everyday life, institutions,
   factions, power/resource relationships and the conditions that create the
   central conflict. Include only details that affect character choices or
   something the audience will encounter.
3. **Rules ledger**: rule ID, established fact/proposed rule, trigger,
   capability, boundary, cost, exceptions already justified and evidence.
   The climax must be possible under these rules. Never invent a new power to
   rescue a plot that the existing rules cannot resolve.
4. **History and world timeline**: ordered events, time/date or relative order,
   participants, causes, consequences and source/reliability. Keep what really
   happened separate from legends, cover stories and mistaken beliefs.
5. **Character dossiers**: dramatic function, external goal, internal need,
   fear, contradiction, motivation, competence/limits, secret, stakes, initial
   relationships, speech/behavior pattern and intended arc. Give supporting
   characters independent reasons to act. Do not introduce everyone at once.
6. **Knowledge ledger**: what each relevant character and the audience knows
   initially; how information can be learned; what remains hidden. Identify
   deliberate unreliable accounts. Knowledge changes require an observable
   discovery, communication or supported deduction.
7. **Series arc**: initiating disruption, escalating causal choices, major
   reversals, crisis, climax and consequence. Explain how the ending answers
   the opening conflict and thematic question. Label an undecided ending
   explicitly instead of pretending it is already fixed.
8. **Visual and sound language**: style, composition, space, palette, light,
   recurring motifs, performance scale, voice and sound principles. Separate
   stable identity anchors from scene-specific states.
9. **Constraint coverage and open questions**: requirement ID, source,
   proposed coverage, verification method, decision status and unresolved risk.

Give entities stable editorial labels (for example CHAR-01, RULE-02). They are
writing references, never invented Bone asset/episode/shot IDs. Record real tool
IDs alongside them once created. Reuse labels across all project documents.

## Review before handoff

- Test a major character choice and the proposed climax against world rules.
- Explain why the main conflict cannot be solved trivially at the start.
- Identify the causal source of every major secret or planned revelation.
- Separate actual chronology from the planned order of audience disclosure.
- Check that the concept fits the requested cast, locations and duration.
- Mark each requirement supported, needs revision or not yet verified, with
  evidence. A fashionable genre label is not evidence of audience appeal.

Save the substantive world/background and project context in
`projectBible.background`, rules and knowledge constraints in
`projectBible.rules`, actual chronology in `projectBible.timeline`, and
each character's dossier/relationships in that character asset's `profile`
via `add_assets`/`update_asset`, with its introduction and image prompts. Save the causal
series arc in `arc`; keep `brief` as a concise introduction. Use section-level
patches through `update_production` and reread the saved fields. The Project
page must show these core settings without requiring an external file.
Keep expanded planning/review appendices in companion documents only when
needed. Register stable visual asset specifications separately when requested;
preserve locks and real IDs. Do not treat filled sections as editorial approval.

Handoff to series planning with the bible's editorial revision, approved facts,
proposed choices, central conflict, ending direction and unresolved decisions.
Do not start writing all episodes when the user requested only development.
