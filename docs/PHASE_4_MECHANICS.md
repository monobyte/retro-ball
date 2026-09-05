# Phase 4 mechanics and acceptance

Phase 4 implementation and its G4 acceptance gate are verified. P4-01–08 are
complete. The phase adds twelve playable mechanic/puzzle rooms and the Workshop
circuit tools. Campaign expansion, opponents and NPCs follow in later phases.

## Moving surfaces (P4-02)

Three registry parts are available in the Workshop and course selector:

| Part / demo | Behaviour | Physical course completion |
| --- | --- | --- |
| Conveyor / Conveyor Run | Gold chevrons show belt direction. Bounded tangential acceleration permits steering and counter-steering. | 6.58–6.60 s |
| Shuttle bridge / Shuttle Bay | Smooth travel with stationary boarding windows at both docks. Brake holds position relative to the platform. | 8.20–8.23 s |
| Rotating platform / Spin Crossing | Signed rotation, circular direction arrows and physical carrying. Wide deck and 15°/s demo speed allow an ordinary approach. | 13.16–13.23 s |

Times are automated input runs at simulated 30/60/120 Hz, with zero resets.
They establish traversal, not human difficulty or physical display coverage.
Each run contacts the moving collider, leaves it, reaches the goal, then retries,
revisits the checkpoint and falls to verify safe recovery and restored motion state.

Moving surfaces own their Rapier body, render objects and local clock. Checkpoint
snapshots include that clock. Braking and the speed cap operate relative to the
support body's velocity at the contact position, including rotational velocity.
Conveyor animation follows the same restorable local clock as its mechanism.

The Workshop exposes dimensions, direction, belt speed/acceleration, shuttle
travel/period/dwell and signed rotation speed through the shared part schema.
Amber outlines show the complete sweep plus marble-radius clearance. Validation
rejects impossible dwell timing, excessive linear/corner speeds, wall obstructions
and moving surfaces crossing coplanar static floors. Rotator clearance uses a
circle/rectangle test, avoiding false positives at the corners of its bounding box.
The rotating demo sits 0.06 units above its docks to avoid coplanar flicker.

## Reactive obstacles (P4-03)

| Part / demo | Behaviour | Automated course completion |
| --- | --- | --- |
| Spring bumper / Spring Yard | Actual collider contact compresses the spring for 0.12 s, then produces one bounded outward kick and enters cooldown. The demo route uses the rebound. | 3.33–3.37 s |
| Seesaw / Balance Act | Contact position determines the load around a damped pivot. Tilt and angular speed are bounded; the unloaded deck returns to level. | 3.08–3.10 s |
| Recovering floor / Borrowed Time | Four bars count down before withdrawal. Both drop and retract variants disable collision, fade away and return after a recovery delay. | 3.87–3.88 s |

Every course completes at simulated 30/60/120 Hz with zero resets. These are
isolated teaching/test rooms, not the finished campaign courses.

A returning floor waits until dynamic bodies clear its original volume before
becoming solid. The withdrawn deck disappears after its half-second animation,
leaving the rim to mark the gap; it must not suggest a lower landing surface.
The return preview has no depth write or collision. P4-06 extends occupied
volume and seesaw load checks to pushable puzzle objects. A reset signal also
waits for an occupied, withdrawn floor to clear before restoring collision.

Seesaw angle/angular velocity, floor phase/timer and bumper charge/cooldown are
serialisable checkpoint state. Twelve physical probes cover floor warning/fall,
actual checkpoint deaths for every new family, blocked and clear floor returns,
seesaw loading/settling, and charged spring contact. A braked marble loads the
seesaw to approximately -6.27°; after removing the weight, it settles to within
0.001° of level. The same inputs produce matching probe results at all three
presentation cadences.

Authoring bounds include the seesaw's full vertical tilt, the floor's three-unit
drop or complete retract path. Existing wall-clearance checks use those bounds.
Bumpers require floor support under their entire radius and spawn clearance.
Floor warning/recovery limits are exposed through the shared inspector. All new
parts participate in the editor's all-registry-parts regression.

## Native contracts (P4-01)

The original jump pads, elevators, lasers, voids, checkpoints and goals now use
one adapter for clock, activation, capture/reset and disposal. Jump cooldowns,
checkpoint activation and laser re-arming state are included in snapshots.
Elevator reset immediately rewinds its collider together with its logical clock;
disposal removes its owned physics body and is idempotent.

Laser/elevator `clock` parameters distinguish `continuous` from `resettable`.
Existing documents retain continuous cycles across Retry; new Workshop parts
use resettable clocks. An explicit snapshot or reset signal restores its stated
clock in either mode. The preserved original route still completes at 56.3 seconds
with three resets. A focused native probe restores all 25 components after an
actual checkpoint fall, in addition to per-family snapshot checks.

Editor diagnostics now include laser sweeps, the full elevator column, trigger
footprints, and jump launch/landing extents. Vertical extents accompany their
SVG diagnostics. Native elevator and laser peak speeds have bounded validation.
These diagnostics supplement, rather than replace, actual course traversal.

## Signals (P4-04)

Channels have stable names and port-derived types: `active`/`enable` carry
booleans; AND/OR use distinct boolean `inputA` and `inputB` ports.
`activated`/`completed`/`reset` and sequence `step1`/`step2`/`step3` carry event pulses. Named document
channels and instance-local links share the same compiler and runtime.
Validation rejects missing ports, mismatched types, duplicate delivery, conflicting
state writers and cycles. V1 circuits are deliberately acyclic; timed behaviour
belongs inside a timed component rather than a feedback wire.

Per fixed step, components advance their clocks, one queued interaction is
consumed, current boolean outputs are published, and the signal queue drains
before physics contacts/controls advance the world. Linked callbacks never run
recursively. Duplicate boolean states are suppressed; repeated pulses remain
distinct. Checkpoint activation pulses settle before the checkpoint snapshot.
On restore, old queued work is discarded and restored source states are
republished before play resumes.

The network retains 128 causal trace records. It bounds queued work at 8192
deliveries and processing at 4096 per step; overload produces a visible retry/error
message instead of blocking the frame loop. Retry clears the fault. The trace
is available through the Workshop live and last-play trace view described below.

Toggle and timed switches expose `active` state and interaction pulses. Lasers,
elevators, jump pads, conveyors, shuttles and rotators accept activation/reset;
reactive plates and bumpers accept reset. Disabled jump pads disappear, conveyors
stop driving, moving platforms hold their position, and lasers become safe.
Re-enabling a laser provides a half-second warning before it can kill.

**Signal Crossing** is a playable first circuit. Interact at the switch to cut
the laser, cross and bank its state. Keyboard-input completions at simulated
30/60/120 Hz all pass with zero resets (about 1.33 seconds using full input).
The test changes the powered state after banking checkpoint 2, takes a real fall,
and verifies both source and target recover to the saved off state. It also
checks retry initial state, re-arming safety, queued inline pulses and timed expiry.
A browser keyboard press of E was separately observed to deliver `main-power=false`.

## Puzzle components (P4-05)

Pressure plates, lifting doors, AND/OR gates and three-step sequences join the
shared runtime, registry, inspector and checkpoint contract. Their visuals use
inward contact teeth, separate input lamps, numbered clues, progress lights and
moving panels so their purpose and state do not depend on colour alone. Camera-facing
circuit labels use a dark backing and fitted text to remain legible against the
floor grid; door clues sit above the complete lift.

- Plates require actual Rapier solver contact from a dynamic body above the
  plate. An airborne marble in the footprint does not activate it. A short
  80 ms release debounce prevents edge chatter from retriggering a toggle.
  Hold, toggle and timed modes share the same contact edge; holding a timed
  plate cannot continually restart its timer.
- Doors lift 1.4 units over an authored travel time. The moving leading edge
  checks dynamic-body clearance on every physics step. A closing door waits
  above an occupant and resumes after it clears. Side contact does not block
  an opening request. Signal reset uses the same safe movement path.
- AND/OR gates combine two separately typed inputs. Ordered sequences accept
  pulses in order 1, 2, 3; a wrong answer clears progress, while 1 starts again.
  Each correct partial answer refreshes the authored timeout. Completion latches
  until reset and emits one pulse. Snapshot restore never replays that pulse.
- Snapshots include contact/latch/timer state, door request and movement fraction,
  gate inputs, and partial sequence progress/remaining time. Validation rejects
  unsupported plates/doors, obstructed door lifts and checkpoint spawns inside
  the complete door travel. Workshop diagnostics show their physical extents.

**Two Factor** combines an ARM switch with an eight-second pressure plate through
an AND gate. **Ordered Garden** asks for three numbered interactions before its
door opens. Six automated input routes complete with zero resets at simulated
30/60/120 Hz: 4.18–4.30 seconds and 5.36–5.57 seconds respectively. They bank a
checkpoint, take a real fall, verify every saved component and clear on Retry.
These short rooms demonstrate components; campaign pacing remains later work.

Fifteen targeted physical probes cover all plate modes, non-contact rejection,
door opening/closing safety, partial-sequence checkpoint death recovery, wrong
order, re-completion and timeout. Separate OR wiring exercises each input against
a physical door. Door safety stops at the same movement fraction (0.78125) at
all three simulated cadences. Tests use teleports only to arrange targeted probes;
the six complete routes use steering input and keyboard interaction events.
Pushable objects now use the same contact and clearance queries, as described below.

## Physical objects and momentum (P4-06)

Pushable resonators are Rapier cubes or orbs with authored mass, size and one of
three symbols: triangle, circle or square. The symbol appears on every face,
on matching plates/receivers, and in the clue labels; colour is supplementary.
A normal marble cannot activate a symbol-specific plate. Objects move through
actual collisions and can hold a plate after the player leaves. Pressure plates
now have matching beveled render/collider geometry so cube bottoms do not catch
on their edges. The demo's physical receiving bays keep rolling cargo parked.

Each object has a marked home. A fall below the course's lower boundary starts
a configurable recovery delay. Interact at the home can also recall a stranded
object. During recovery the body is disabled and the home shows a wireframe
preview. Reappearance waits for both dynamic bodies and solid/kinematic geometry
to clear the spawn volume. Valid landings on lower floors do not count as loss;
a separate multi-level probe verifies descent and recall between floors.

Snapshots store pose, rotation, linear/angular velocity and recovery phase/timer.
If a saved object would occupy the marble's checkpoint spawn, the object enters
safe recall before the marble returns. Required objects therefore cannot trap the
player at respawn. Homes require supported floor, independent clearances and safe
separation from walls, doors and player/checkpoint spawns.

Conveyors transport cargo, seesaws respond to object weight, and recovering
floors both trigger under objects and wait for them to clear. Doors use the same
clearance query for marbles and resonators. Object speed is bounded at 28 units/s;
cube friction permits ordinary pushes without removing its physical mass.

Momentum receivers require a new solver contact with sufficient inward momentum,
using velocity recorded before the collision and the body's actual mass. Sideways
rubbing, vertical landings and the wrong symbol cannot substitute for the impact.
The gauge shows measured progress; reaching the threshold latches a boolean output
and emits one activation pulse. Checkpoint restore preserves the latch without
replaying its pulse. Two settling steps prevent stale restored contacts from being
mistaken for fresh impacts.

**Symbol Yard** requires a triangle cube and circle orb to remain on their matching
plates before an AND-controlled door opens. **Impulse Vault** requires a triangle
resonator to strike its receiver with enough momentum. Both complete through
physical steering/pushing at simulated 30/60/120 Hz with zero resets, followed by
actual checkpoint death/restoration. The vault route delivers about 5.08 against
its 4.5 threshold. Focused impact probes reject about 1.36 and accept about 10.20
at all three cadences. Nineteen targeted probes cover matching, object falls,
keyboard recall, occupied/blocked homes, pending recovery snapshots, doors,
reactive floors, seesaws, conveyors, unsafe saved spawn poses and lower floors.

## Validation evidence

- `npm test`: 45 passing tests, including motion timing, transform/sweep bounds,
  malformed parameters, blocked docks and authoring every registered part.
- `npm run build`: passed; existing large bundle warning remains.
- `npm run test:browser`: passed with the two new mechanical suites included.
  Existing 64 HDR scenarios, 45 void drops, audio settings, 20 lifecycle cycles,
  movement and camera/contact fixtures remain green. Legacy completion remains
  56.3 simulation seconds with three resets.
- `npm run test:editor`: complete UI authoring/recovery/play workflow passed.
  Import/recovery now frames the new document immediately; an added UI assertion
  catches accidentally framing the previous course before its deferred redraw.
- Ten-second braked rides retain local position within 0.044 world units.
  Fresh-world 30/60/120 Hz contact fixtures produce matching positions.
- Screenshots of the six mechanical demos, Signal Crossing and the Workshop sweep overlay inspected.
- 64 additional HDR checks cover idle/charging/cooling springs, both seesaw
  tilts, and solid/warning/withdrawn/returning floors with AA/bloom on and off.
- The full game and Workshop suites passed after adding reactive obstacles;
  the final withdrawn-deck visibility adjustment also passed the complete
  reactive physics suite, its 64 HDR checks and the production build.
- After signal/native-clock integration, the full browser suite and Workshop
  workflow passed. Native diagnostics then passed three additional Node tests,
  the focused native runtime suite, production build and the Workshop workflow.
- After P4-05 integration, the full browser and Workshop suites passed. The
  original circuit still wins at 56.3 seconds with three resets. New suites add
  six solved puzzle routes, fifteen physical probes and 60 HDR checks across
  pressure, door, gate and sequence states with AA/bloom on and off. The final
  circuit-label adjustment also passed those HDR checks and the production build.
  Nine additional pixel comparisons verify each clue is visibly rendered rather
  than merely producing finite pixels; circuit clues use overlay depth so scene
  geometry cannot hide an essential number.

- After P4-06 integration, the full game and Workshop workflows passed. Six new
  complete object routes and 52 new HDR states cover cubes/orbs, matching plates,
  live/recovering bodies and momentum gauges with AA/bloom on and off. The final
  course-wide recovery boundary also passed all nineteen object probes and the
  production build. Symbol Yard and Impulse Vault screenshots were inspected.

Machine-readable evidence and screenshots: [phase-4 evidence](evidence/phase-4/).

## Workshop circuits and diagnostics (P4-07)

Open **Signals** in the Workshop Inspector to name a connection and choose its
source/output and target/input. The input list only offers compatible types.
State wires are solid; event pulses are dashed. Arrows indicate direction, and
selecting a wire selects both endpoints. Parallel connections use separate curves.
Connections can be renamed or removed, including imported instance-local links.
Every operation validates atomically and participates in undo/redo and autosave.
Invalid feedback, duplicate writers and incompatible ports preserve the draft.

Open **Reset groups** to add or rename a group, or merge it into another group.
Renames and merges update part assignments and checkpoint references together.
Assign selected parts through **Reset group** in the Inspector. Select a checkpoint
to choose the groups it restores after death. Checked groups return to the captured
checkpoint state; unchecked groups retain their current state. The group-level
**Before first checkpoint** choice determines whether initial state is restored
before any checkpoint has been reached. These controls expose the existing reset
contract; imported attempt/checkpoint policy values remain valid.

**Circuit trace** appears only in Workshop play tests and the editor. Open it and
choose a component to see its current boolean outputs, latest delivered inputs,
upstream cause chain, recent events and captured logical state. A bounded history
holds 128 deliveries. Current input reasons are retained separately, so an idle
mechanism remains explainable after unrelated events fill the history. If an older
parent has expired, the view says so. Root events identify the source; it does not
invent an exact keyboard/contact cause that the runtime did not record.

Returning to the editor captures detached evidence before the physics/audio session
is disposed. The panel is labelled **last play test** and explicitly says that the
current draft may differ. Editing does not change that evidence. A new play test
starts fresh; reloading the page recovers the draft but discards diagnostic history.
Live capture runs at most five times per second while the panel is open.

Verification:

- 45 Node tests pass, including atomic connection/group edits, inline-link rename
  and undo, checkpoint/prefab group remapping and detached input inspection after
  history eviction. Production build passes; the existing large-bundle warning remains.
- The complete game suite passes, preserving the original 56.3-second/three-reset
  baseline, mechanics/puzzle routes, rendering, settings and lifecycle checks.
- The complete Workshop suite passes. A new UI-only authoring fixture places a
  switch, two logic gates, a door and checkpoint; connects five state/pulse wires;
  sets reset groups; rejects a feedback loop without changing the draft; selects
  endpoints and renames a channel with undo/redo; then physically solves the course.
  Changing the live switch and dying restores the authored checkpoint circuit.
- Live trace identifies the door's enable input and upstream logic cause. Returning
  disposes the game session, retains evidence and leaves the draft unchanged.
  Export and actual page reload preserve the authored wires and checkpoint groups.
- Workshop screenshots were inspected; ordinary pointer placement/drag and smaller
  window checks in the existing editor suite still pass.

## Mixed interactions and acceptance (P4-08 / G4)

**Relay Works** combines conveyor → shuttle → rotator → retracting floor in one
continuous route. Its decks retain their independent clocks and physics bodies.
The final three-cadence input runs complete in 26.06–26.08 seconds with no resets.
Contact evidence records all four surfaces, including roughly ten seconds on each
moving carrier and the retracting floor's warning/withdrawal. The final checkpoint
restores every component after a fall. Re-entering the earlier logged checkpoint
preserves the latest spawn and snapshot rather than downgrading progress.

Twelve additional cargo fixtures cover cube/orb × bridge/rotator × 30/60/120 Hz.
Cargo stays on the real colliders for over five seconds and changes position with
the carrier. Orbs roll relative to the deck; they are not glued to it. Entering a
second checkpoint banks the moving body and carrier clock together; actual death
restores that pair. Existing mixed-body probes cover conveyor acceleration, seesaw
load, occupied floor return, object recall clearance and closing doors.

Both **Symbol Yard** and **Impulse Vault** now lose every required movable object
before their completion runs. The objects fall, disable while recovering, return
home without a player retry, and are then physically pushed to solve the puzzle.
All six recovered-object runs complete, bank the final checkpoint and survive death.

### G4 requirement-to-evidence audit

| Requirement | Playable evidence | Contact / recovery evidence |
| --- | --- | --- |
| Three different puzzles from shared parts | Two Factor (timed AND), Ordered Garden (sequence), Symbol Yard (matched weights), Impulse Vault (momentum) | `puzzles`, `object-courses`: twelve completed routes; saved components restored after actual death; retries clear solutions |
| Death during an unfinished puzzle | Ordered Garden with two answers banked | `puzzles`: partial sequence restored at all three cadences, no fabricated completion pulse, restored puzzle can finish |
| Required objects remain recoverable | Symbol Yard and Impulse Vault | `object-courses`: all objects lost and recovered before solving; `object-recovery`: recall, occupied homes, conflicting saved poses and lower-floor travel |
| Conveyor / sliding bridge / rotator | Conveyor Run, Shuttle Bay, Spin Crossing, Relay Works | `moving-surfaces`, `mechanical-courses`, `mixed-mechanics`: physical carrying, braking, boarding/exit, mixed transfers, checkpoint restoration |
| Spring bumper / seesaw / withdrawing floor | Spring Yard, Balance Act, Borrowed Time | `reactive-obstacles`: spring charge/kick, load/settling, both floor modes, actual falls, safe return and checkpoint state |
| Plates / doors / matching / momentum | Two Factor, Symbol Yard, Impulse Vault | `puzzles`, `object-recovery`: solver contact, wrong symbol/airborne rejection, bounded impact threshold and anti-crush behaviour |
| Existing obstacle families retain their contract | Original Circuit and Sightlines | `obstacle-contracts`, `course`, `camera-contacts`, `voids`: native reset/activation, elevator collider rewind/disposal, trajectories and fall clearance |
| Authoring, wiring and diagnostic workflow | Workshop-authored switch/AND/door course | `editor-circuits`: UI authoring, invalid-cycle preservation, physical solution, group recovery, causal trace, export and actual reload |
| Checkpoint revisits do not lose progress | Relay Works | `mixed-mechanics`: revisiting an earlier logged checkpoint leaves the latest snapshot unchanged; subsequent death restores the latest checkpoint |

The full game and Workshop suites pass on the final Phase 4 implementation. The
last focused mixed-mechanics run additionally verifies the explicit earlier-checkpoint
revisit and second-checkpoint cargo entry. The production build and 45 Node tests
pass. The original circuit retains its 56.3-second, three-reset baseline.

Validation boundaries remain explicit: simulated frame rates are not physical
display/controller coverage; that matrix remains in P2-07/P9-01. Static wall/floor
sweep checks reject known obstructions. Timing-dependent transfers between moving
parts require physical play tests, as demonstrated by Relay Works; the validator
does not claim to prove every possible authored motion arrangement. Guide hints
(P5-06), additional campaign art/audio and generated-course verification remain in
their scheduled phases.
