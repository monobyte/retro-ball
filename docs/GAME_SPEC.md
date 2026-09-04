# Retro Ball: game and engine specification

Status: proposed implementation baseline, 4 September 2026.  
Existing prototype baseline: commit `9f93950`.  
Progress tracker: [Implementation plan](IMPLEMENTATION_PLAN.md).

This document defines the intended game. The implementation plan owns task
status and release gates. New features described here are requirements, not
claims about the current build. Names, content counts and tuning values below
are planning defaults that can be revised after the first region is play-tested.

## 1. Product vision

Build a substantial single-player marble adventure in a connected synthwave
world. Players roll, brake, explore, solve physical puzzles, outmanoeuvre enemies
and race rivals through handcrafted courses. Reusable parts and an internal
editor make new regions economical to build. Seeded procedural challenges add
replayability after those parts have proved enjoyable in authored levels.

The engine is specific to Retro Ball. Keep TypeScript, Three.js, Rapier and the
existing Web Audio foundation unless measurements expose a concrete limitation.
Extract reusable systems incrementally while keeping the current course playable.

### Creative mandate

The user's direction is to make the game **stand out, be fun and genuinely
surprising**, with broad creative freedom over the game, palette, sound, music,
effects, characters, environments, geometry, physics and mechanics. Physical
realism is optional when a deliberate rule change makes the game more original
and enjoyable.

Treat the prototype's synthwave style and the working region ideas as starting
points. Explore unexpected palettes, musical genres and arrangements, unusual
spaces, playful characters, physical interactions and transformations of familiar
mechanics. Routine creative choices within the agreed feature scope do not need
separate approval. The aim is a recognisable game with memorable discoveries and
contrasting moods, including quiet moments that make the spectacular ones count.

- **CRE-01:** Prototype bold ideas across gameplay, visuals and audio before
  settling each region's direction. Keep the experiments that improve play.
- **CRE-02:** Give each region a distinctive signature moment and optional
  discoveries: an unexpected interaction, changing environment, musical response,
  encounter or playful secret that rewards curiosity.
- **CRE-03:** Evaluate originality, enjoyment and surprise in human play-tests.
  Ask what players remember, what surprised them and what they want to try again.
  Maintain readable hazards, fair recovery, accessibility and performance as the
  presentation and mechanics evolve.
- **CRE-04:** Explore unusual geometry and physical rules as playable mechanics:
  changing gravity, deforming or folding tracks, curved worlds, spatial loops,
  elastic surfaces and transformed momentum. Introduce each rule through a safe
  interaction, communicate when it applies, and make its consequences consistent
  enough for players to experiment and gain mastery. Prototype early; promote
  successful ideas into reusable parts rather than committing every idea to ship.

#### Geometry and physics experiments

These are creative prompts, not a fixed feature commitment. New ideas are welcome.

| Experiment | Playable surprise to explore |
| --- | --- |
| Gravity gardens | Roll onto a wall or around a tiny planetoid as local gravity changes; familiar surfaces become new routes |
| Folding tracks | Hinged sections turn a flat course into a tower, bridge or enclosing chamber while the player rides them |
| Momentum portals | Exit in another orientation with redirected velocity; build speed in one room to solve a puzzle elsewhere |
| Elastic architecture | Bowls, membranes or springy floors store and release movement to launch the marble or move puzzle objects |
| Spatial loops | A looping corridor or wraparound boundary reconnects unexpected places; teach the connection so players can exploit it |
| Musical geometry | Platforms ripple, rotate or reshape with a musical pattern; visual timing cues keep the mechanic playable with music off |

For each prototype, document the rule, how the player discovers it, its effect
on steering/camera/enemies, and how the world returns to a safe checkpoint state.
Match collision geometry to visible geometry during transformations. Keep the
ordinary course as a control case so experimental behaviour stays intentional.

### Design pillars

1. **Momentum is the main interaction.** Steering, braking, impacts and surfaces
   create both traversal and combat challenges.
2. **Failure is readable and recovery is quick.** Show hazards before they can
   hurt the player; explain deaths and avoid lengthy repeat journeys.
3. **Exploration rewards curiosity.** Branches, shortcuts, NPCs and optional
   challenges make larger spaces worth investigating.
4. **Parts combine predictably.** Platforms, enemies and puzzles follow shared
   activation, collision and reset rules.
5. **The synthwave presentation supports play.** Music, colour and glow establish
   identity without hiding the ball or communicating danger through colour alone.

### Main play loop

Explore hub → choose destination → learn and combine mechanics → reach
checkpoints → complete the objective → earn progress and rewards → return to
the hub or continue to another course. Revisit courses for medals, secrets,
better times and rival races.

## 2. Scope and release boundaries

| Milestone | Deliverable |
| --- | --- |
| Playable first region | Small hub; three polished courses covering speed, puzzles and exploration; bumper bot, sentinel, guide NPC, and a rival encounter; one regional soundtrack; internal editor workflow |
| Campaign v1 | One hub; three regions with four courses each, excluding the hub; ten obstacle families; three opponent archetypes and guide NPC; three regional soundtracks; saves, medals, collectibles, controller support and accessibility settings |
| Replayability expansion | Seeded challenges, local daily challenges, shareable seeds, validated prefab generation, personal ghosts and endless course segments |
| World expansion | More regions, obstacle families, opponents, NPC quests, guardian encounters and optional public creation tools |

The three first-region courses count toward the twelve-course campaign. The
region's fourth course is a finale added during campaign production. V1 finales
combine existing systems; a bespoke boss is not required to ship the campaign.

### Initial platform and exclusions

- Desktop browser with keyboard and controller; responsive menus and fullscreen.
- Proposed support matrix: current desktop Chrome, Edge, Firefox and Safari.
  Record exact tested versions and reference hardware before performance sign-off.
- Static hosting remains sufficient for the campaign and local saves.
- No multiplayer, accounts, cloud saves, global leaderboards or public content
  hosting in v1. Local seed sharing does not require any of these services.
- Touch controls, native packaging and mobile performance are later decisions.
- Universal jumping, permanent handling upgrades, a health system and weapons
  remain experiments. None is required by the initial movement or combat design.

## 3. Existing foundation

These capabilities are present in the source at the baseline. Their existence
does not establish readiness for multiple levels or a finished release.

| Area | Current implementation | Needed next |
| --- | --- | --- |
| Course data | One `LEVEL`, declarative pieces in [LevelData.ts](../src/game/LevelData.ts) | Stable IDs, catalogue, versioned files, validation and prefabs |
| Game lifecycle | Intro/play/reset/win in [Game.ts](../src/game/Game.ts) | Loading, pause, transitions, results and level teardown |
| Physics | Fixed 120 Hz stepping, CCD marble, ramps and kinematic platforms in [Physics.ts](../src/physics/Physics.ts) | Surface profiles, controlled contacts, reset contracts and broader regressions |
| Obstacles | Walls, lasers, voids, jump pads, elevators, checkpoints and goal in [Dynamics.ts](../src/game/Dynamics.ts) | Shared component lifecycle, signals and new obstacle families |
| Rendering | Isometric camera, merged geometry, grid shaders, bloom and CRT effects | Camera zones, occlusion handling, themes and level resource ownership |
| Audio | One procedural soundtrack, SFX, beat-driven visuals | Track catalogue, transitions, adaptive layers and independent volume buses |
| Input/UI | Keyboard controls, HUD, intro, settings, fullscreen | Action mapping, controller menus, pause and progression screens |
| Persistence | Quality settings in localStorage | Versioned player progress and resilient save migration |
| Verification | Layout tests, browser HDR/void checks and a waypoint autopilot | CI test execution, multi-level fixtures and actor/puzzle/generator tests |

Preserve the fixes for coplanar floor overlap, outline depth flicker, invalid
MSAA shader values and marble clearance through voids. The current deployment
workflow builds the game; it does not yet run the regression suites.

## 4. Functional requirements

### FND — Runtime and content foundation

- **FND-01:** Load a level by ID from a catalogue. A session owns its physics
  world, entities, render objects, subscriptions and level-specific audio.
- **FND-02:** Support boot, hub, loading, playing, paused, resetting, results
  and transition states. Invalid transitions must leave a recoverable screen.
- **FND-03:** Provide explicit create, fixed-update, visual-update, reset and
  dispose contracts for gameplay components. Dispose resources on level exit.
- **FND-04:** Use versioned, validated level data with stable IDs and typed
  references. Imported level files contain data, never executable scripts.
- **FND-05:** Maintain a shared prefab registry and parameter definitions used
  by the runtime, editor, validator and generator.
- **FND-06:** Validate geometry, references, starts, objectives and intended
  route connections. Treat warnings separately from errors that prevent play.

### MOV — Movement, camera and surfaces

- **MOV-01:** Preserve familiar base rolling feel and fixed-step simulation;
  deliberate experimental zones may introduce clearly signalled physical rules. Add a
  tunable brake action, analogue steering, dead zones and input remapping.
- **MOV-02:** Support surface profiles for standard track, ice, rubber and
  rough ground; conveyors add directional motion. Teach each before combining it.
- **MOV-03:** Give distinct visual/audio feedback for landing, sliding, braking,
  impacts, boosts and loss of ground contact.
- **MOV-04:** Add camera zones for wide arenas, close puzzles, speed sections
  and vertical routes. Keep the ball and its next meaningful landing visible.
- **MOV-05:** Fade or otherwise resolve obstructing scenery without hiding
  hazards. Optional rotation may be prototyped for exploration; do not require
  rotating the camera to complete the initial campaign.
- **MOV-06:** Default jumps remain pad/launcher driven. Clear gaps and landing
  space must accommodate the marble collider and contact tolerances.

### WLD — World, course types and progression structure

- **WLD-01:** Create a hub with discoverable region entrances, locked/unlocked
  states, a guide NPC and clear destination information.
- **WLD-02:** Support linear runs, circuits/races, exploration arenas, puzzle
  chambers, vertical climbs and timed survival objectives. Not every type must
  appear in the first region; the campaign must demonstrate varied layouts.
- **WLD-03:** Define primary objectives separately from geometry. A course can
  require reaching a goal, winning a race, solving a puzzle or surviving a timer.
- **WLD-04:** Include checkpoints, optional routes, shortcuts, secrets and
  region finales. Mandatory progression must not depend on optional collectibles.
- **WLD-05:** Load connected areas on demand. Begin with explicit transitions;
  add seamless streaming only if tested course designs require it.
- **WLD-06:** Long expeditions can resume at a stable checkpoint after reopening
  the game. Restore logical state rather than raw physics-engine handles.

### OBS — Obstacle and surface library

All obstacles expose bounds, parameters, activation/reset behaviour, editor
representation and validation rules. Moving obstacles also expose a swept
danger volume. They must have a readable safe state and warning where applicable.

| Campaign v1 family | Behaviour and design use |
| --- | --- |
| Bumpers and rails | Redirect momentum; delineate safe edges; include active spring bumpers |
| Laser systems | Sweeping beams, gates and visible charge/safe phases |
| Void openings | Fall hazards with collider clearance and matching visible bounds |
| Jump pads | Authored launch/landing pairs with tested trajectories |
| Elevators | Connect heights with boarding, waiting and exit space |
| Conveyors | Change approach speed and direction; support signal control |
| Sliding bridges | Open/close routes with safe waiting space |
| Rotating platforms | Carry the marble across a gap or change route orientation |
| Collapsing/retracting floors | Warn, withdraw and recover under explicit timing rules |
| Seesaws | Shift under weight for traversal and physical puzzles |

Expansion library: orbital platforms, banked corners, funnels, cannons, boost
strips, crushers, swinging arms, shutters, pushable weights, breakable barriers,
wind/fans, magnets, gravity zones, teleporters, one-way gates, switch tracks,
sticky surfaces and electrified floors. Add these through the same contracts.

### PZL — Puzzles and signals

- **PZL-01:** Support switches, pressure plates, doors, bridges and elevator or
  hazard activation through named, typed signal channels.
- **PZL-02:** Support hold, toggle and timed activation; ordered sequences;
  simple AND/OR conditions; and clearly labelled colour/frequency matching.
- **PZL-03:** Add pushable objects that can hold plates, and momentum-triggered
  mechanisms. Required movable objects must be recoverable if lost.
- **PZL-04:** Show the relationship between a switch and its targets. Offer
  optional progressive hints through the guide rather than automatically solving.
- **PZL-05:** Reject invalid links and unbounded signal feedback. Evaluate
  updates in a documented order within the fixed simulation step.
- **PZL-06:** Define initial and checkpoint states for every puzzle. Resetting,
  revisiting or saving must never permanently lock a required route.

### ACT — Enemies, opponents and friendly NPCs

Opponents challenge positioning and momentum. Initial combat uses contact,
knockback, hazards and puzzle interactions; it does not introduce a separate
weapon system. Attacks must be readable in the isometric view and avoid repeated
uncontrollable hits immediately after a reset or stun.

| Actor | Required behaviour | Release |
| --- | --- | --- |
| Bumper bot | Patrol a territory, approach, telegraph a shove, recover; player can dodge or knock it into a hazard | V1 |
| Laser sentinel | Visible scan/detection, charge warning, line-of-sight attack, cooldown and disable signal | V1 |
| Rival racer | Follow a course through normal movement physics; recover from mistakes; run an overtaking race with a clear finish/result | V1 |
| Guide drone | Optional dialogue, tutorial demonstration and contextual puzzle hints; cannot block a required route | V1 |
| Chaser orb | Pursue within a bounded territory; give up/recover without crossing forbidden gaps | Expansion |
| Magnet drone | Telegraph attraction/repulsion; affect movement and selected puzzle objects | Expansion |
| Track sweeper | Predictable patrol with passing/waiting opportunities | Expansion |
| Interceptor | Telegraph a predicted-path charge; allow baiting into hazards or barriers | Expansion |
| Guardian | Arena encounter combining taught behaviours and readable vulnerability windows | Expansion |
| Recurring rival NPC | Dialogue and repeat challenges across regions | Expansion |
| Stranded/maintenance bots | Rescue or repair quests that open optional routes and shortcuts | Expansion |
| Companion | Escort and cooperative puzzle actions with recovery if separated or lost | Expansion |

- **ACT-01:** Share a small state-machine foundation: idle, patrol, alert,
  chase, telegraph, attack, recover, stunned and defeated. Each type uses only
  relevant states; NPC dialogue and quest state remain separate from combat.
- **ACT-02:** Use an authored route graph with platform, ramp, jump and elevator
  links. Flat ground navigation alone is insufficient for the suspended course.
- **ACT-03:** Actors declare movement capabilities and hazard tolerance. They
  cannot use route links they are unable to traverse.
- **ACT-04:** Define team/contact rules, knockback limits, stun recovery,
  territorial leashing, fall recovery and checkpoint reset policy per actor.
- **ACT-05:** Define attack warning and cooldown parameters; initial tuning
  starts with at least 0.5 seconds of warning for a newly introduced lethal
  attack and is reviewed through play-testing.
- **ACT-06:** Place safe spawn/landing areas outside active attacks. Limit
  simultaneous attackers and avoid off-screen attacks without visible warning.
- **ACT-07:** Connect enemies to puzzle signals: disabling a sentinel, opening
  an arena exit, or baiting a bot onto a plate. Defeat events fire once.
- **ACT-08:** Editor tools show territories, routes, detection ranges, attack
  zones and encounter reset rules. Generation uses the same placement metadata.
- **ACT-09:** Rival routes include recovery and elevator/jump behaviour. The
  development autopilot is a test aid, not a finished race opponent or ghost.

### EDT — Internal editor and authoring workflow

- **EDT-01:** Use the runtime's level format and registry. Avoid an independent
  editor geometry model that drifts from collisions and gameplay.
- **EDT-02:** Provide placement, rotation, resizing, grid snapping, elevation,
  selection, multiselection, duplicate/delete and a parameter inspector.
- **EDT-03:** Provide undo/redo, autosave, searchable palettes, prefab creation
  and import/export. Preserve edits if play-testing or loading fails.
- **EDT-04:** Start a test from a spawn, checkpoint or selected position, then
  return to the same editing state without saving transient simulation changes.
- **EDT-05:** Edit signal links, objectives, camera zones, actor routes,
  checkpoint reset groups, music and region themes.
- **EDT-06:** Display collider/swept bounds, invalid references, route sockets,
  clearance issues and validation reports with selectable offending objects.
- **EDT-07:** A designer must be able to assemble, test, save and reload a
  complete course from existing parts without editing TypeScript.

### PROG — Saves, rewards and replay

- **PROG-01:** Persist unlocked regions, completions, collectibles, cosmetics,
  medal records, personal bests, accessibility settings and resumable checkpoints.
- **PROG-02:** Completion, time and low-reset medals are separate achievements.
  Keep the ordinary finish achievable without mastering speed techniques.
- **PROG-03:** Cosmetic rewards include marble skins, trails and effects. Keep
  mandatory routes independent of permanent speed/handling upgrades.
- **PROG-04:** Use a versioned save envelope, migration, backup/recovery and
  explicit save-failure feedback. A corrupt or incompatible save must not crash
  the game or silently overwrite the only recoverable copy.
- **PROG-05:** Timing includes reset animations and excludes explicit pause and
  loading. Assisted and standard records are labelled separately. Rule/content
  versions identify comparable records when physics or layouts change.
- **PROG-06:** Ghost runs arrive with replayability features. Record enough
  authoritative movement data for visual playback; do not promise identical
  physics simulation across different browsers or hardware.

### AUD — Music, sound and regional identity

- **AUD-01:** Introduce a track catalogue with tempo, sections, loop/transition
  rules and beat events. Supply three regional tracks for the campaign; hub and
  result music may initially use arrangements of those tracks.
- **AUD-02:** Crossfade or transition cleanly between hub, course, danger,
  puzzle success and results. Add/remove musical layers without abrupt restarts.
- **AUD-03:** Add surface, obstacle, enemy and NPC cues with spatial/distance
  control and limits on simultaneous sounds.
- **AUD-04:** Provide independent music, effects and ambience volumes. Retain
  graceful silent play if audio cannot start, and prevent overlapping sequencers
  or accumulated audio nodes after resets and transitions.
- **AUD-05:** Regions have distinct palettes, backdrop treatments, track
  materials and music while retaining shared hazard and interaction conventions.
- **AUD-06:** Add separate **Music** and **Sound FX** on/off controls to Settings.
  Each takes effect immediately and independently, persists across reloads, and
  preserves its category's volume setting. The existing master mute temporarily
  silences both without overwriting either preference; unmuting respects the
  saved category choices. Verify all four on/off combinations.

### UX — Menus, onboarding and accessibility

- **UX-01:** Provide title/continue, hub travel, course selection, pause,
  results, retry, return-to-hub and settings flows on keyboard and controller.
- **UX-02:** Teach steering, braking, checkpoints, obstacles and enemy
  counterplay through short playable introductions with optional hints.
- **UX-03:** Offer reduced motion/flashing, adjustable bloom/CRT effects,
  readable UI scaling and non-colour cues for interaction and danger.
- **UX-04:** Offer clearly labelled assists for slower hazard timing and
  additional recovery points. Slowing hazards must preserve puzzle solvability.
- **UX-05:** Pause safely on focus loss/controller disconnect. Clear held
  inputs and resume only through a deliberate player action.

### GEN — Procedural challenges

- **GEN-01:** Generate layouts from authored, tested sections with entrance/
  exit sockets, elevation, travel direction, bounds, clearance, approach-speed,
  stopping-distance, difficulty and mechanic metadata.
- **GEN-02:** Assemble a required route, then optional branches and encounters.
  Preserve checkpoint spacing, safe waiting areas and recovery routes.
- **GEN-03:** Validate sockets, collisions, jump links, elevators, routes,
  encounter dodge space and puzzle dependencies before offering a course.
- **GEN-04:** Bound retries and generation time. If no valid course is found,
  use a known-valid fallback or report a recoverable generation failure.
- **GEN-05:** Seeds reproduce layout for the same generator and content version.
  Share codes include those versions and the ruleset; reject unsupported versions
  clearly rather than silently generating a different course.
- **GEN-06:** Support custom seeds and local daily challenges derived from a
  documented UTC date rule. Local dailies have no global ranking or anti-cheat claim.
- **GEN-07:** Endless mode loads/unloads sections under a resource budget and
  keeps a safe continuation boundary. Do not require seamless campaign streaming.
- **GEN-08:** Only allow procedural puzzle/enemy combinations with validated
  templates. Autopilot success checks reachability, not whether a course is fun.

## 5. Architecture and data contracts

### Runtime responsibilities

| Component | Owns | Migration starting point |
| --- | --- | --- |
| Application shell | Boot, menus, focus, global settings and session transitions | `main.ts`, `Hud`, `SettingsPanel` |
| World catalogue | Region graph, level metadata, unlock requirements | New layer above `LEVEL` |
| Level session | Runtime entities, objectives, checkpoints, clocks and teardown | Extract from `Game` |
| Physics service | Fixed step, bodies, contact queries and physical reset | Existing `Physics` |
| Component registry | Factories, parameter schema, editor metadata and validators | Split `Dynamics` by component |
| Signal/objective systems | Puzzle events, conditions and completion | Extract from trigger handling |
| Actor system | Behaviour state, navigation, contacts and encounters | New system using existing movement primitives |
| Presentation | Camera, scene resources, effects, theme and feedback | Existing render modules and `Marble` |
| Audio director | Track state, transitions, buses and voice limits | Existing `AudioSystem`/`Soundtrack` |
| Save service | Serialisable progress, migration and storage recovery | Separate from quality settings |
| Authoring/generation | Build and validate shared level documents | New editor and prefab assembler |

Do not introduce a generic ECS, plugin marketplace or scripting language as a
prerequisite. Prefer explicit interfaces and a small typed registry until a
specific content requirement justifies more abstraction.

### Minimum document contracts

| Document | Required information |
| --- | --- |
| World/region | ID, content version, theme, level entries, links, unlock rules, guide locations |
| Level | Schema/content version, ID, metadata, theme/music IDs, spawn, instances, checkpoints, objectives, signals, navigation, camera zones and validation metadata |
| Instance | Stable ID, prefab/type ID, transform, typed parameters, links and reset group |
| Prefab | Version, instances, exposed parameters, sockets, bounds, capability/difficulty tags and validation fixtures |
| Checkpoint | Stable ID, safe spawn transform, logical snapshot policy and object reset groups |
| Actor definition | Behaviour type, physical profile, capabilities, route/territory, attack tuning and reset policy |
| Save | Schema version, content/rules version, progression, records, settings reference and optional resume state |
| Generated challenge | Seed, generator/content/rules versions, options and validation result |

The editor exports a level document. The loader validates and resolves it. The
runtime builds render and physics objects from the same resolved dimensions.
The generator emits that same document and runs the same validation pipeline.

### Simulation and reset rules

- Simulation advances at the fixed physics timestep. AI decisions, timers and
  signal evaluation use simulation time; music scheduling uses the audio clock.
- Document and test contact/event ordering. Queue mutations so a signal cannot
  delete a body while contact iteration is using it.
- A checkpoint records logical state: solved groups, checkpoint-local objects,
  encounter state and resume location. Recreate transient physics state safely.
- Unsolved puzzles and ordinary enemies reset to the checkpoint's declared
  state. Completed progression and awarded collectibles are idempotent.
- Each persistent switch, defeated guardian or NPC objective declares whether
  it lasts for the attempt, checkpoint, course completion or save profile.
- Always clear transient attacks, forces, contacts and stale input during a
  reset. Re-enter at a safe position before restoring enemy activation.
- Play-test mode owns a temporary session. It cannot mutate the editor document
  or campaign save unless the developer explicitly invokes a save operation.

## 6. Initial content plan

Working region names communicate design intent and can change.

| Region | Identity | Four-course structure |
| --- | --- | --- |
| Neon Grid | Readable industrial circuit; introduces core movement and opponents | Speed course, switch puzzle, branching arena, combined finale |
| Pulse Foundry | Machinery, moving structures, heat-coloured lighting, heavier music | Conveyor/bridge run, weight puzzle, vertical ascent, encounter finale |
| Aurora Heights | Open sky, slippery surfaces, long views, lighter musical textures | Downhill run, route puzzle, rival circuit, expedition finale |

The first region must prove speed, puzzle and exploration play before the
remaining nine campaign courses are produced. Every course gets a short design
sheet: intended mechanic, objective, estimated play length, routes, checkpoint
plan, actors, music, accessibility concerns and play-test observations.

## 7. Quality and acceptance policy

### Provisional budgets

- Target smooth 60 FPS gameplay on the reference desktop configurations chosen
  in phase 0. Record viewport, pixel ratio, settings and scene alongside results.
- Initial target: 95th-percentile gameplay frame time at or below 16.7 ms at
  the chosen standard preset. Measure low and high presets separately.
- Repeated level load/unload cycles must show no accumulating bodies, listeners,
  active music layers or owned render resources. Establish measured memory
  baselines before setting hard memory and loading-time budgets.
- Provide a supported lower-quality preset for weaker hardware; verify gameplay
  equivalence at 30, 60 and 120 Hz display rates within documented tolerances.

### Required evidence

| Layer | Evidence |
| --- | --- |
| Data | Schema/migration fixtures, ID/link checks, clearance/overlap checks and progression reachability |
| Physics | Drops, ramps, launches, moving surfaces, enemy impacts and repeated resets using real colliders |
| Puzzles/actors | Solve/reset paths, lost-object recovery, signal loops, patrol boundaries, stun and race recovery |
| Rendering | Normal/Retina views, quality combinations, camera occlusion and finite HDR buffers |
| Lifecycle/save | Repeated transitions, paused reload/resume, migration, corrupt data and unavailable storage |
| Content | Human first-time play-through, documented confusion/unfair deaths, and reference-route checks where applicable |
| Generation | Fixed regression seeds, invalid template rejection, bounded failure and validated seed sweeps |

Automated checks cannot establish that a puzzle is understandable, a race feels
fair or a course is enjoyable. Human play-test evidence is required at content gates.

## 8. Decisions to validate before broad production

| Decision | Planning default | Review point |
| --- | --- | --- |
| World scale | Connected areas with explicit loading | First large exploration course |
| Combat model | Knockback, stun and environmental defeat | First bumper-bot and sentinel encounters |
| Camera rotation | Fixed isometric camera with zones | First exploration/vertical play-test |
| Progression | Completion unlocks; optional mastery/cosmetics | First-region gate |
| Campaign size | Three regions, twelve courses | First-region production-cost review |
| Editor audience | Internal creator tooling first | Campaign content-production gate |
| Procedural complexity | Tested sections; limited puzzle/enemy templates | Generator prototype gate |
| Public services | None required | Only after local sharing demonstrates demand |

Changes to these defaults should update this document and affected checklist
items together. Keep the original prototype course as a regression fixture and
optional legacy challenge throughout development.
