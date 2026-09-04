# Phase 1 — course documents and session lifecycle

The application now opens at **The Relay**, with the original circuit and a
short **Relay / 01** warm-up. Select a course, then press Space to boot. Course
controls offer pause/resume, a full-course retry and return to the relay. **P**
also pauses. Focus loss pauses a running course; resume is explicit.

## Content contract

`src/content/levels/*.json` are version-1 documents. The catalogue resolves a
stable level ID to a fresh validated document before creating resources. The
legacy JSON compiles to exactly the same `LevelDefinition` as the preserved
`LEVEL` fixture, including all widened voids and floor partitioning.

Each instance stores its own ID, part type, position and quarter-turn yaw,
typed parameters, reset group and port links. IDs are persisted in the asset;
reordering instances does not generate new identities. Dimensions are local to
the transform. Ramp/elevator `y1` and jump target coordinates are offsets from
the transform. Floor-grid origins are local offsets too. Resolution rotates
footprints, ramp directions, launch targets and laser sweep direction without
altering gate timing. `PartRegistry` is the shared parameter/port catalogue;
`DYNAMIC_REGISTRY` supplies typed runtime factories for existing dynamic parts.

Validation rejects unsupported versions/assets/parts, unknown parameters,
non-JSON data, oversized documents, duplicate IDs, bad dimensions, broken
references/ports, invalid checkpoints/objectives, unsupported spawns, narrow
voids and coplanar floor overlaps. Declared route footprints must connect,
including explicit jump targets. Issues have severity, document path and an
instance ID where applicable. Undeclared routes and uncertain jump landings
produce warnings requiring a play-test. These structural checks do not claim to
prove arbitrary puzzle solvability or jump timing.

The minimum data contract includes navigation, camera zones, signals and
actor/puzzle/objective reset state. Current parts expose no signal inputs;
unsupported links fail validation. Their gameplay systems remain in later
phases. Navigation and camera authoring data do not imply a shipped actor or
camera-zone implementation.

## Ownership and lifecycle

`Application` owns one renderer, post-processing stack, settings UI, global event
listeners and requestAnimationFrame loop. It queues level transitions and exposes
boot, hub, loading, intro, playing, paused, resetting, results, transition, error
and disposed states. Content errors return a readable recovery screen with a
working return-to-relay action. A new session is created only after the previous
one has closed, including its AudioContext. Rapid load requests run in order.

`LevelSession` owns the validated document, Rapier world, input listeners, game,
HUD timers/toasts, background, audio graph/sequencer and development autopilot.
`Game` groups all its render objects under an owned root. Disposal stops input
and sequencer callbacks, removes scene/camera children, releases geometry,
materials, textures, render targets and PMREM resources, frees Rapier and closes
audio. Application-level post buffers remain allocated between courses.
Disposal is idempotent. A partially failed construction cleans up resources
created before the failure.

Master mute survives course transitions; category preferences remain saved
independently. Music and FX sources belong to the current session. Selecting a
course does not unlock audio or start the ball: the intro retains Space-only boot.
The Retry control becomes available after boot.

## Clock and reset ordering

1. The application receives wall time, applies the frame cap and bounds large gaps.
2. Game presentation/state timers advance by that frame's elapsed time.
3. Rapier accumulates time and advances at 1/120 second. Its simulation clock
   advances per substep; component kinematics and controls run before `world.step`.
4. The game reads the completed physics state and collects trigger events into an
   array. It handles deaths, launch/checkpoint events and completion outside the
   physics step. Scene/level transitions run through the application's promise
   queue, after the synchronous update has returned.
5. Collision-sensitive laser/elevator presentation uses simulation time. Other
   effects use presentation time. Music scheduling/beat energy uses AudioContext
   time. Muting does not stop that clock. Explicit pause freezes simulation and
   suspends audio; resume clears held input and resets wall-time accumulation.

`RuntimeComponent` defines fixed update, visual update, logical capture/reset
and dispose. The existing mechanic classes are retained behind typed factories,
preserving their collider dimensions and tuning. A checkpoint captures a JSON
snapshot with schema/content/level identity, safe spawn and named groups. Groups
reserve separate component, actor, puzzle and objective state maps. A checkpoint
lists the groups restored on death; otherwise non-course groups reset from the
initial snapshot. Transient pad cooldowns and stale contact/input state clear on
respawn. Course retry clears all current component state and checkpoints.
Legacy course groups preserve its continuously timed hazards across deaths.

Full cross-session checkpoint persistence and migration remain phase 7 work;
these snapshots establish the logical contract and in-session reset behaviour.

## Gate evidence

Run `npm test`, `npm run build` and, with the dev server and agent-browser,
`npm run test:browser`. The browser runner loads the legacy course through the
application before each existing regression. It also runs `lifecycle.browser.js`.

- Eleven Node tests pass, including exact legacy equivalence, transform handling,
  reference/geometry rejection and catalogue integrity.
- [Legacy course](evidence/phase-1/completion.json): all 49 waypoints, WIN with
  hazards enabled and three resets; the simulation-clock change preserves the route.
- [Lifecycle checks](evidence/phase-1/lifecycle.json): two warmup cycles followed
  by twenty alternating **rendered** legacy/relay load/unload cycles. Each cycle
  checks audio closure, stopped scheduling, disposed input, empty owned roots,
  expected physics body counts and stable unloaded renderer counts.
- The same check completes Relay / 01 without resets, visits its checkpoint,
  round-trips a logical snapshot, restores a checkpoint group after death,
  verifies pause/resume and queued requests, rejects malformed content and returns
  to the relay, and ensures a supplied title is displayed as text.
- Existing [normal HDR](evidence/phase-1/rendering-normal.json),
  [Retina HDR](evidence/phase-1/rendering-retina.json),
  [45 void drops](evidence/phase-1/voids.json) and
  [audio controls](evidence/phase-1/audio.json) regressions pass.

The cycle check measures allocated resources, not a noisy JavaScript heap-size
sample. After each unload, only the renderer camera and application post-processing
resources remain. Per-course resource counts vary with visible random background
shards. Twenty cycles establish this fixture's teardown behaviour; future actors,
editor play-tests and generated segments must extend these checks.
