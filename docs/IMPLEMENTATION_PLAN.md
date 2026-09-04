# Retro Ball: phased implementation checklist

Specification: [Game and engine specification](GAME_SPEC.md).  
Baseline: `9f93950`, reviewed 4 September 2026.  
Current delivery state: phases 0–3 accepted; phase 4 is next. Physical input/display checks remain tracked under P2-07 and P9-01.

## How to track progress

- Check an item only when its result is implemented and its relevant checks pass.
- Use the stable task ID in commits, issues and pull requests. Split large tasks
  into child checklists while keeping the parent ID.
- A completed task does not close a phase: its acceptance gate must also pass.
- Add evidence to the delivery log: commit/PR, test output, playable build or
  play-test notes. Unchecked means outstanding, not necessarily blocked.
- Status values: Not started, In progress, Blocked, Ready for review, Done.
  Record a concrete dependency when using Blocked.
- Later phases are planned scope. Do not mark existing prototype equivalents
  complete when they still need the multi-level contracts described in the spec.
- Estimates should follow the first-region production review; no calendar dates
  or staffing assumptions have been invented here.

## Existing baseline — source confirmed

- [x] **B-01** One complete isometric course with fixed-step marble physics.
- [x] **B-02** Rails, ramps, lasers, jump pads, elevators, voids and checkpoints.
- [x] **B-03** Procedural soundtrack, effects, HUD and quality settings.
- [x] **B-04** Floor overlap/depth flicker and MSAA shader corrections.
- [x] **B-05** Widened voids with matching geometry and fall/respawn regression.
- [x] **B-06** Local layout tests, GPU checks, void checks and development autopilot.
- [x] **B-07** Static build and GitHub Pages deployment workflow.

Evidence: baseline source and tests in commit `9f93950`. These checks recognise
existing features; they do not claim campaign, editor or opponent functionality.

## Milestone dashboard

| Phase | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| 0 | Baseline, budgets, audio toggles and development safety | Existing prototype | Done |
| 1 | Multiple levels and owned runtime lifecycle | 0 | Done |
| 2 | Movement, camera and player controls | 1 | Done; hardware matrix deferred to P9-01 |
| 3 | Internal editor foundation | 1; 2 for final play-test UX | Done |
| 4 | Obstacles, signals and puzzles | 2, 3 | Not started |
| 5 | Enemies, rival and guide NPC | 2, 3; 4 for encounter signals | Not started |
| 6 | Playable first region and soundtrack | 4, 5 | Not started |
| 7 | Progression, saves and finished player flows | 6 | Not started |
| 8 | Three-region, twelve-course campaign | 6, 7 | Not started |
| 9 | Campaign v1 release candidate | 8 | Not started |
| 10 | Seeded generation and replayability | 9 | Not started |
| 11 | More regions, actors and creator features | 9; 10 for generation extensions | Not started |

Editor foundations and movement work can overlap after phase 1. Obstacle and
actor work can overlap once their shared contracts are stable. Prototype risky
ideas early, but complete prerequisite gates before depending on them for content.

## Phase 0 — Establish a measurable baseline

Requirements: FND-06, AUD-06, quality policy. Outcome: preserve the working game,
add independent audio toggles and make future regressions visible.

- [x] **P0-01** Capture a reproducible baseline build, course completion, current
  rendering checks and representative screenshots/settings.
- [x] **P0-02** Select reference hardware/browser versions and representative
  normal/Retina, low/standard/high-quality scenarios.
- [x] **P0-03** Measure current frame time, physics cost, draw calls, load time
  and resource counts; establish practical budgets from those measurements.
- [x] **P0-04** Run typecheck/build and layout tests in CI; make the browser
  checks repeatable and record any runner-specific GPU limitations explicitly.
- [x] **P0-05** Add an issue/play-test template with level ID, version, input,
  settings, reproduction steps and expected/actual behaviour.
- [x] **P0-06** Confirm first-region goals, release scope and provisional defaults
  in the spec; record only decisions that materially affect implementation.
- [x] **P0-07** Add independent **Music** and **Sound FX** on/off options to
  Settings. Apply changes immediately, persist them across reloads, preserve
  volume preferences and make master mute respect both choices. Verify all four
  combinations, reload behaviour and compatibility with existing saved settings.
  This task can ship against the prototype before the wider engine refactor.

Acceptance gate:

- [x] **G0** A fresh checkout builds and runs the documented checks. A baseline
  course can be completed, independent audio toggles work and persist, and
  hardware/settings accompany performance evidence.

## Phase 1 — Runtime lifecycle and multiple levels

Requirements: FND-01–06, WLD-05. Outcome: switch between real courses without
leaking state or duplicating game code.

- [x] **P1-01** Define versioned level/catalogue documents, stable instance IDs,
  typed references and runtime validation with actionable errors.
- [x] **P1-02** Convert the existing `LEVEL` into a catalogue entry and preserve
  it as the legacy course and a regression fixture.
- [x] **P1-03** Extract an application shell and level session from `main.ts`
  and `Game`; implement explicit lifecycle states and recoverable load failures.
- [x] **P1-04** Define component create/update/reset/dispose contracts and a
  typed registry. Migrate existing dynamic pieces without changing their feel.
- [x] **P1-05** Separate fixed simulation, presentation and audio clocks; specify
  event ordering and queue lifecycle mutations safely.
- [x] **P1-06** Implement complete teardown of physics worlds, render objects,
  owned materials/textures, audio, input listeners and event subscriptions.
- [x] **P1-07** Define checkpoint reset groups and serialisable logical snapshots;
  cover actors, puzzles and objectives in the contract before implementing them.
- [x] **P1-08** Add a minimal hub/selector and a second small test level to prove
  loading, retrying, returning and failure recovery.

Acceptance gate:

- [x] **G1** Complete the legacy course and the test course. Cycle between hub
  and courses twenty times without accumulating owned resources, duplicate input
  handlers, music layers or stale collision objects. A malformed level fails safely.

## Phase 2 — Movement, camera and input

Requirements: MOV-01–06, UX-05. Outcome: dependable controls across course types.

- [x] **P2-01** Introduce an action map for roll, brake, interact, pause, retry
  and menus; support keyboard rebinding and controller analogue/dead-zone settings.
- [x] **P2-02** Implement and tune braking without losing the marble's weight;
  record stopping distance at several approach speeds.
- [x] **P2-03** Implement standard, ice, rubber and rough surface profiles with
  shared physics/audio metadata and readable visual differences.
- [x] **P2-04** Add camera zones and smooth transitions for speed, vertical,
  puzzle and wide-arena fixtures.
- [x] **P2-05** Resolve scenery occlusion and test edge/landing visibility;
  evaluate optional rotation only if the exploration fixture needs it.
- [x] **P2-06** Add contact/landing/sliding feedback and safely handle focus loss,
  disconnected controllers and input clearing during resets.
- [ ] **P2-07** Verify comparable control behaviour at 30/60/120 Hz displays,
  repeat landings and contacts, and preserve the legacy route. Automated cadence,
  contact and legacy checks pass. Physical controller/display coverage remains
  open under **P9-01**; the user accepted the movement fixtures and asked to
  continue, with further tuning later (4 September 2026).

Acceptance gate:

- [x] **G2** Keyboard and controller can complete movement fixtures and recover
  from pause/disconnect. The ball stays visible in all camera fixtures. Document
  braking/surface tuning and resolve unexplained physics differences.

## Phase 3 — Internal editor foundation

Requirements: EDT-01–07, FND-04–06. Outcome: author basic courses without code edits.

- [x] **P3-01** Create an editor route/mode using the same registry and document
  format as the loader. Keep edit state separate from simulation state.
- [x] **P3-02** Implement selection/multiselection, place/move/rotate/resize,
  duplicate/delete, grid snapping and elevation controls.
- [x] **P3-03** Add searchable part palettes and a typed parameter inspector.
- [x] **P3-04** Implement command-based undo/redo, autosave/recovery and explicit
  import/export with schema validation and understandable failure messages.
- [x] **P3-05** Save a selection as a reusable prefab with exposed parameters;
  implement stable ID remapping when duplicating/importing linked instances.
- [x] **P3-06** Add play-from-spawn/checkpoint/selection and return-to-edit without
  changing the document or campaign save.
- [x] **P3-07** Overlay collider bounds, grid clearance, overlaps and invalid
  links; select offending instances from the validation report.
- [x] **P3-08** Add objective, checkpoint and camera-zone authoring plus a basic
  course metadata/music/theme inspector.

Acceptance gate:

- [x] **G3** Build a small course, duplicate a prefab, undo/redo, save, reload,
  play and return to editing without touching TypeScript. Invalid import and a
  failed play-test preserve the previous document and unsaved edits.

## Phase 4 — Modular obstacles and puzzles

Requirements: OBS, PZL-01–06, EDT-05–06. Outcome: reusable mechanics that compose
and reset predictably.

- [ ] **P4-01** Finish migrating existing obstacle families to registry parameters,
  shared reset rules, debug visuals and validation fixtures.
- [ ] **P4-02** Add conveyors, sliding bridges and rotating platforms, including
  carrying/contact behaviour and boarding/exit clearance.
- [ ] **P4-03** Add spring bumpers, seesaws and collapsing/retracting floors with
  telegraphing, recovery timing and swept-volume validation.
- [ ] **P4-04** Implement typed signal channels, queued event processing and
  invalid-link/unbounded-feedback detection.
- [ ] **P4-05** Add switches, pressure plates, doors, timed/toggle actions,
  ordered sequences and simple AND/OR conditions.
- [ ] **P4-06** Add pushable puzzle objects, object recovery and momentum-triggered
  mechanisms; make matching puzzles readable without colour alone.
- [ ] **P4-07** Add editor signal wiring, reset groups, obstacle danger bounds
  and a trace view for why a puzzle target is active.
- [ ] **P4-08** Build test rooms covering each family and mixed interactions;
  test death midway through a puzzle, lost objects, reset and checkpoint revisit.

Acceptance gate:

- [ ] **G4** Assemble and solve three different puzzles using shared components.
  Every puzzle recovers after a lost object or death. Each new obstacle has a
  playable demonstration, collider test and working checkpoint reset behaviour.

## Phase 5 — Opponents and NPCs

Requirements: ACT-01–09, EDT-05–06. Outcome: opponents and a guide that work in
the same physical world as the player.

- [ ] **P5-01** Implement the actor lifecycle/state-machine foundation, teams,
  contacts, bounded knockback, stun recovery and exactly-once defeat events.
- [ ] **P5-02** Author a route graph with traversable platforms, ramps, jump and
  elevator links; add capability restrictions, stuck detection and safe recovery.
- [ ] **P5-03** Build the bumper bot: patrol, territory, approach, shove warning,
  attack/recovery and defeat through environmental hazards.
- [ ] **P5-04** Build the sentinel: scan, visible detection, line of sight,
  charged attack, cooldown and signal-controlled disabling.
- [ ] **P5-05** Build a rival racer using the movement system, with passing
  opportunities, jump/elevator traversal, mistake recovery and race results.
- [ ] **P5-06** Add the guide drone with optional dialogue, demonstrations and
  progressive hints that reflect puzzle state.
- [ ] **P5-07** Implement encounter activation/reset groups, safe spawn windows,
  concurrent-attacker limits and enemy/puzzle signal integration.
- [ ] **P5-08** Add editor patrol/territory/route tools and detection/attack
  overlays; validate positions near gaps, landings and checkpoints.
- [ ] **P5-09** Test patrol edges, leashing, lost targets, repeated impacts,
  recovery after falling, disabled sentinels, race restarts and NPC blocking.

Acceptance gate:

- [ ] **G5** A human can read and counter both enemy types, finish a rival race
  and request a useful guide hint. No encounter traps the player in a repeated
  hit/reset cycle, and actors cannot block a required route permanently.

## Phase 6 — Playable first region

Requirements: CRE-01–04, WLD-01–04, AUD-01–05, UX-02. Outcome: demonstrate the actual game
before producing the full campaign.

- [ ] **P6-01** Build the small hub, region entrance and guide introduction.
- [ ] **P6-02** Author a speed course using braking, jumps and moving structures.
- [ ] **P6-03** Author a puzzle course combining signals, physical objects and
  an enemy interaction with a recoverable checkpoint state.
- [ ] **P6-04** Author a larger exploration arena with branches, a secret,
  shortcut, NPC hint and rival challenge.
- [ ] **P6-05** Implement the audio catalogue/director, separate volume buses,
  clean transitions, voice limits and region-specific surface/actor cues.
- [ ] **P6-06** Complete one regional soundtrack/arrangement with adaptive layers
  and consistent beat events; establish the regional visual theme.
- [ ] **P6-07** Provide basic course objectives/results and playable tutorials;
  demonstrate all three initial opponents and the guide across the region.
- [ ] **P6-08** Run first-time human play-tests; record unclear routes, unfair
  deaths, puzzle misunderstandings, enemy readability and enjoyment.
- [ ] **P6-09** Measure time spent building/revising courses in the editor;
  fix authoring bottlenecks and review remaining campaign scope.
- [ ] **P6-10** Prototype at least three contrasting creative ideas across
  gameplay, palette/effects and music/sound. Develop the strongest into the
  region's signature surprise, and record what players found memorable, fun and
  worth replaying. Treat the proposed theme as open to creative revision.
- [ ] **P6-11** Build small playable experiments with unusual geometry and
  physics, such as local gravity, folding tracks or momentum portals. Evaluate
  whether players can discover and exploit the new rule. Check camera/steering,
  collision alignment, enemy interactions and checkpoint recovery. Carry the
  strongest idea into the first region if it improves play; record why each
  experiment is kept, revised or dropped. The prototype list is open-ended.

Acceptance gate:

- [ ] **G6** All three courses can be completed without developer intervention.
  Human feedback demonstrates understandable speed, puzzle and exploration play.
  Record evidence of a memorable signature moment and enjoyable surprises.
  Capture a build, play-test findings, performance results and a scope decision
  before starting broad campaign production.

## Phase 7 — Saves, progression and finished player flows

Requirements: PROG-01–05, WLD-06, UX-01–05. Outcome: players can return to and
progress through the game reliably.

- [ ] **P7-01** Implement versioned save documents, migration fixtures, recoverable
  backups and storage-failure handling; preserve existing quality preferences.
- [ ] **P7-02** Persist region unlocks, completions, collectibles, cosmetics and
  resumable checkpoints; make rewards and completion events idempotent.
- [ ] **P7-03** Implement completion/time/low-reset medals, personal bests and
  content/rules-versioned records with separate assist labels.
- [ ] **P7-04** Add continue, region/course selection, pause, results, retry and
  return-to-hub flows, navigable entirely by keyboard or controller.
- [ ] **P7-05** Add reduced motion/flashing, bloom/CRT controls, UI scaling,
  non-colour cues and independent music/effects/ambience volume controls.
- [ ] **P7-06** Add slower-hazard and recovery assists; check that timing changes
  do not break puzzle sequences, elevators or rival objectives.
- [ ] **P7-07** Test save/load during progression, checkpoint resume, old/corrupt
  saves, unavailable storage, focus loss and controller reconnection.

Acceptance gate:

- [ ] **G7** Complete a course, earn a reward, close/reopen the game and continue
  correctly. Recover safely from bad save data. All core flows work on controller,
  and a reduced-effects assisted play-through is completable and labelled correctly.

## Phase 8 — Campaign production

Requirements: CRE, WLD, OBS, ACT, AUD, PROG. Outcome: the complete campaign content.

- [ ] **P8-01** Approve the twelve-course content matrix with objective/layout,
  taught mechanics, actors, music, checkpoints, secrets and finale roles.
- [ ] **P8-02** Add the fourth Neon Grid course as its combined finale.
- [ ] **P8-03** Build and test four Pulse Foundry courses, including vertical
  traversal, machinery puzzles and its finale.
- [ ] **P8-04** Build and test four Aurora Heights courses, including slippery
  surfaces, a rival circuit, exploration and its expedition finale.
- [ ] **P8-05** Complete the second and third soundtracks and regional themes;
  check transitions and hazard conventions across all regions.
- [ ] **P8-06** Complete hub unlocks, optional collectibles, shortcuts, cosmetic
  rewards and guide hints without making optional content block progression.
- [ ] **P8-07** Verify that all ten obstacle families and initial actor types
  have meaningful, taught uses rather than incidental placement.
- [ ] **P8-08** Review difficulty/checkpoint pacing across the entire campaign;
  validate routes and human-test puzzles, arenas and finales.
- [ ] **P8-09** Create reusable prefabs from successful sections, with connection,
  approach-speed, stopping-distance and difficulty metadata for future generation.
- [ ] **P8-10** Give each region a distinct signature surprise, optional playful
  discoveries and deliberate contrasts in mood, sound and visual treatment.
  Human-test their enjoyment, readability and originality; revise ideas that
  feel repetitive or spectacular without adding worthwhile play.

Acceptance gate:

- [ ] **G8** A new save can reach the campaign ending through twelve complete
  courses and three regions. Verify optional branches separately. No course needs
  debug flags; every course has validation and human play-test evidence.

## Phase 9 — Campaign v1 release candidate

Requirements: all v1 requirements and quality policy. Outcome: a release with
known support boundaries and repeatable verification.

- [ ] **P9-01** Run the browser/input/display-rate support matrix and compare
  gameplay and performance with the phase-0 budgets.
- [ ] **P9-02** Profile the largest arena, busiest encounter and longest expedition;
  fix measured bottlenecks and verify level/audio resource teardown.
- [ ] **P9-03** Complete full-run, reset, save migration, accessibility, actor,
  puzzle, layout and HDR regression passes against the release candidate.
- [ ] **P9-04** Review loading/error messages, instructions, controls, credits,
  content/audio licensing records and release documentation.
- [ ] **P9-05** Triage remaining defects; resolve progression blockers, trapped
  states, data loss and critical readability/performance failures.
- [ ] **P9-06** Record release build/version, supported configurations, known
  issues and rollback artifact. Prepare deployment for explicit release approval.

Acceptance gate:

- [ ] **G9** Campaign v1 satisfies G0–G8; final validation evidence matches the
  release build. No known progression blocker or save-loss defect remains. Record
  release approval before publishing; preparing this plan does not deploy a build.

## Phase 10 — Procedural courses and replayability

Requirements: GEN-01–08, PROG-06. Outcome: replayable courses from verified parts.

- [ ] **P10-01** Finalise versioned prefab sockets, footprints, capabilities,
  approach/landing space, difficulty and mechanic metadata; add editor overlays.
- [ ] **P10-02** Generate a required route from compatible sections, then bounded
  optional branches, objectives, checkpoints and controlled encounters.
- [ ] **P10-03** Validate collisions, route connectivity, jumps, elevators,
  stopping distance, puzzle dependencies and enemy dodge/landing space.
- [ ] **P10-04** Bound generation retries/time; implement known-valid fallback
  and useful diagnostics for rejected assemblies.
- [ ] **P10-05** Add reproducible seeds, generator/content/rules versions and
  share codes with explicit compatibility errors.
- [ ] **P10-06** Add custom-seed and local daily-challenge menus, documented UTC
  date selection and separate records by challenge/rules version.
- [ ] **P10-07** Add personal ghost recording/playback with non-colliding visuals
  and clear handling of incompatible content versions.
- [ ] **P10-08** Implement endless segment lifecycle with safe continuation,
  checkpoint recovery and bounded active resource counts.
- [ ] **P10-09** Run at least 1,000 seeds per supported generation preset through
  structural validation; keep failing seeds as fixtures. Sample generated courses
  with real physics checks and human play-tests for variety and fairness.

Acceptance gate:

- [ ] **G10** The same supported share code produces the same layout. No invalid
  assembly is offered as playable; failures terminate cleanly. Sample courses are
  completable and enjoyable, and endless runs stay within the resource budget.

## Phase 11 — World and creator expansion backlog

These features remain part of the longer-term direction. Select a coherent
release theme and define its own acceptance gate before implementing a batch.

- [ ] **P11-01** Add chaser orbs, interceptors and track sweepers, with distinct
  counterplay and territory/route validation.
- [ ] **P11-02** Add magnetic/gravity interactions and magnet drones; validate
  their effects on puzzle objects, jumps, saves and checkpoint recovery.
- [ ] **P11-03** Add guardian encounters with taught phases and arena reset rules.
- [ ] **P11-04** Add recurring rival dialogue, stranded-bot rescues, maintenance
  quests and optional route rewards.
- [ ] **P11-05** Prototype companions/escort puzzles with generous separation,
  fall recovery and no permanent route-blocking states.
- [ ] **P11-06** Expand obstacles with fans, cannons, funnels, banked turns,
  crushers, swinging arms, barriers, teleporters and route-switching mechanisms.
- [ ] **P11-07** Add new regions, larger expeditions, survival arenas and music
  packs using the existing authoring and validation pipeline.
- [ ] **P11-08** Polish the internal editor into an optional player-facing tool:
  onboarding, safe data import, compatibility checks and shareable level files.
- [ ] **P11-09** Evaluate public hosting/discovery, online competition, native
  packaging and touch controls as separate proposals with explicit costs/scope.

## Definition of done for a feature

- [ ] Behaviour matches the referenced requirement and has been played in context.
- [ ] Data/schema, editor controls and validation are updated where applicable.
- [ ] Reset, save/load, pause and disposal behaviour are defined and checked.
- [ ] Controls, warnings and feedback remain readable with accessibility settings.
- [ ] Relevant automated checks pass; human play-test evidence is recorded for
  content, movement, puzzles and encounters.
- [ ] Documentation and task status reflect what shipped, including limitations.

Copy this checklist into the feature's issue or review. Do not tick this template
globally; completion belongs to the individual feature.

## Delivery log

Add one row when a task or gate changes state. Keep evidence concise and link to
the specific commit, PR, build or play-test report.

| Date | Task/gate | Status | Evidence | Remaining issue/next action |
| --- | --- | --- | --- | --- |
| 2026-09-04 | Baseline | Done | `9f93950` | Begin P0-01; expansion phases remain unstarted |

| 2026-09-04 | P0-01–07, G0 | Done | [Baseline, measurements and test evidence](PHASE_0_BASELINE.md); six Node tests, clean install/build, 64 HDR scenarios, 45 void drops, four audio combinations and full course WIN | Phase 1 runtime/schema; high Retina preset remains below 60 FPS target |

| 2026-09-04 | P1-01–08, G1 | Done | [Runtime contracts and gate evidence](PHASE_1_RUNTIME.md); eleven Node tests; legacy WIN; relay WIN; twenty rendered transition cycles; checkpoint reset, pause, invalid-document and audio/input/GPU teardown checks | Phase 2 action map, braking, surfaces and camera fixtures |

| 2026-09-04 | P2-01–03 | Done | [Movement progress and measured stopping distances](PHASE_2_MOVEMENT.md); 36 braking samples; Grip Lab and keyboard/controller API relay completion | P2-04–07 and G2 remain open; current work committed at user request with 15 Node tests/build passing and a pending 30 Hz landing-check failure |

| 2026-09-04 | P2-04–06 | Done | [Camera, contact and full regression evidence](PHASE_2_MOVEMENT.md); landing classification fixed; six keyboard/controller Sightlines runs; occlusion screenshot inspected | P2-07 / G2 await human and physical hardware checks |

| 2026-09-04 | P2-03 / G2 | Revised; gate open | Human review: Sightlines looks great; initial Grip Lab surfaces looked/felt too similar. Stronger material identities, drift/turn/drag behaviour and larger lab areas now pass 48 movement samples and the full regression suite | Human retest of revised Grip Lab; hardware matrix remains unverified |

| 2026-09-04 | P3 foundation | In progress | [Editor document model](PHASE_3_EDITOR.md); five tests cover atomic commands, recovery, prefab reference remapping and detached play documents | Editor UI and in-context G3 workflow still to build; no P3 task is marked complete |

| 2026-09-04 | G2 | Accepted | User retest: “all look good now” and instruction to keep going; full automated suite passes | Physical device/display matrix remains explicitly open at P2-07 / P9-01; continue editor work |

| 2026-09-04 | P3-01–08, G3 | Done | [Workshop controls and acceptance evidence](PHASE_3_EDITOR.md); 21 Node tests; full game regressions; five-part course authored entirely through UI, completed with zero resets; prefab override, group transforms, overlap selection, failed import/play preservation, page recovery and three play starts | Phase 4 obstacles, carrying behaviour and signals; phase-2 acceptance was committed/pushed as `74324d3` |

## Next action

Begin **P4-01–03**: complete obstacle component contracts and introduce
conveyors, moving/rotating platforms, bumpers, seesaws and collapsing floors
with real contact/carrying checks. Then add signals and puzzle composition.
Preserve the legacy, movement and Workshop regression workflows. P2-07 physical
hardware coverage remains tracked in the P9-01 support matrix.
