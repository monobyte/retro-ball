# RETRO BALL

[**Play RETRO BALL in your browser**](https://monobyte.github.io/retro-ball/)

<img width="3024" height="1728" alt="image" src="https://github.com/user-attachments/assets/677a4904-8646-494f-b877-c3b0d3984f19" />
<img width="3024" height="1728" alt="image" src="https://github.com/user-attachments/assets/3ee5ff71-df0c-4c90-a48a-744bc1f1f6f7" />
<img width="3024" height="1728" alt="image" src="https://github.com/user-attachments/assets/9d5450a0-9a1d-47f0-bbd4-0ba334b2fa0b" />


A single-level, isometric marble obstacle course in the spirit of *Marble
Madness*, rebuilt as a Synthwave / Outrun fever dream: glowing grid slabs
floating in a purple nebula, sweeping laser grids, data voids, light-elevators,
jump pads, VCR scanlines and a synth soundtrack whose kick drum drives the glow.

```
npm install
npm run dev        # http://localhost:5173
npm run build      # type-checks, then bundles to dist/
```

| Key                | Action                                  |
| ------------------ | --------------------------------------- |
| Arrows / WASD      | Roll (relative to the isometric camera) |
| R                  | Reboot at the last checkpoint / re-run  |
| M                  | Mute                                    |
| Any key or click   | Boot from the intro screen              |

Screen-up pushes the marble "into" the screen (world `-x, -z`), so following a
corridor that runs up-right means holding **Up + Right**, exactly as in the
original arcade cabinet's trackball logic.

---

## Why these libraries

### Rendering: Three.js (WebGL 2) + custom GLSL

The brief asked for a fixed isometric orthographic view, neon wireframe /
translucent grid surfaces, chromatic bloom, VCR artefacts and a marble that
lights the track. That list is a post-processing pipeline plus a handful of
bespoke shaders, and Three.js is the best fit for exactly that:

* **`OrthographicCamera` with a fixed direction** (`src/render/Renderer.ts`)
  gives the true isometric look. The camera never rotates, so player input can
  be mapped through a constant ground basis (`groundBasis()`), which is what
  makes controls feel predictable.
* **`EffectComposer` + `UnrealBloomPass` + a custom `ShaderPass`**
  (`src/render/PostFX.ts`). Bloom provides the soft neon halo; the VCR pass adds
  radial chromatic aberration, scanlines, an aperture grille, tracking slips,
  block glitches (spiked on boot, death and win), a rolling VHS band, grain,
  vignette and flicker. `OutputPass` performs ACES tone mapping last so bright
  neon cores burn toward white the way real phosphor does.
* **Bespoke `ShaderMaterial`s instead of stock PBR** for the level. The grid
  material (`src/render/GridMaterial.ts`) draws anti-aliased 1-tile grid lines
  from a per-vertex tile-space attribute, tints top faces differently from
  sides, adds a slow travelling light band, and, crucially, adds a
  distance-based glow from a `uMarblePos` uniform so the marble's pink light
  visibly washes over the slabs beneath it. Doing this in the shader is
  cheaper and far more controllable than relying on a point light alone (a
  point light is still attached to the marble for the chrome shell itself).
* **Fat lines (`LineSegments2` / `LineMaterial`)** for slab edges. WebGL's
  native lines are 1 px; the addons' screen-space lines give crisp 2 px neon
  edges that bloom evenly at any resolution.
* **Geometry merging.** Static pieces are merged into one draw call per colour
  tone, and their 12 edges each into one fat-line batch. A 60-piece course
  renders in a handful of draw calls, leaving the frame budget for the
  full-screen bloom chain.
* **PMREM environment for the marble.** `buildNeonEnvironment()` bakes a tiny
  scene of pink/cyan light strips into a prefiltered environment map so the
  chrome marble reflects neon bands instead of a flat colour.

Babylon.js would also have worked, but its strengths (a full scene editor
pipeline, node materials, built-in glow layers) are heavier than needed for a
single hand-authored track, and Three.js's post-processing addons made the
VCR/bloom look a two-file job. WebGPU was ruled out for portability.

### Physics: Rapier (`@dimforge/rapier3d-compat`)

The marble has to feel like heavy chrome, move fast, bounce predictably and
never tunnel through a thin ledge at 20+ m/s. Rapier was chosen over cannon-es
/ Ammo / a hand-rolled solver because:

* **Continuous collision detection** is a one-liner (`setCcdEnabled(true)`),
  and the marble is small and fast, which is precisely the tunnelling case.
* **Rust-compiled WebAssembly solver** with a fixed 120 Hz sub-step
  (`src/physics/Physics.ts`) keeps contact response stable on ramps and edges
  regardless of the display refresh rate.
* **Kinematic position-based bodies** make the light-elevators trivial: the
  platform is moved each step with `setNextKinematicTranslation` and friction
  carries the marble up naturally.
* **Restitution combine rules** let walls bounce harder than floors (`Max`
  combine rule, 0.75 on bumpers vs 0.35 on track) so chicane rebounds feel
  arcade-like while landings stay grounded.
* The `-compat` build inlines the WASM as base64, so `npm run dev` works with
  no special bundler configuration.

### Physics tuning (the "arcade feel")

All numbers live in `TUNING` (`src/physics/Physics.ts`):

* Gravity is `-36` (about 3.7 g). Heavier gravity makes ramps and landings
  read as *weighty* and keeps jump arcs short and readable in an isometric view.
* Input applies an **impulse at the centre of mass plus a matching torque**, so
  the sphere both slides and spins up; friction converts one into the other and
  the result is ~20 m/s² of effective acceleration, i.e. about a second from
  rest to top speed. Air control is about a third of that.
* A **soft speed cap** only cancels the component of input that would push the
  marble beyond `maxSpeed` (16 u/s). Braking and steering always stay
  available, and downhill ramps can still exceed the cap, which is where the
  "the marble feels fast" moments come from.
* Moderate linear damping (0.25) and angular damping (0.35) produce a heavy
  coast-down that still settles when you release the keys.
* Jump pads solve the ballistic launch analytically for their target so every
  launch lands on the same spot, no matter the entry speed.

## Level: the circuit

`src/game/LevelData.ts` describes the course declaratively (slabs, ramps,
walls, jump pads, elevators, lasers, voids, checkpoints, goal). The route winds
through roughly 50 × 65 tiles, several screens in each direction:

1. Boot sector with a bumper chicane, then a ramp onto the **laser plateau**
   (one sweeping beam that parks, safe and blue, at each end of its sweep).
2. A railed pink **ledge** with a jog, then **checkpoint A** and a **jump pad**
   over a void.
3. A corridor to **light-elevator 1**, a high platform with **checkpoint B**
   and a 20-tile **downhill speed ramp**.
4. The **void field**: a wide slab with data voids on its outer lanes. The
   centre lanes are clear, so the ramp exit is a straight brake run.
5. A railed ledge to **checkpoint C**, a timed **laser gate**, and
   **light-elevator 2**.
6. The elevated **skyway** (**checkpoint D** at its start) through three timed
   laser gates that open in travel order, a second jump pad onto a floating
   island with **checkpoint E**, and a walled drop ramp.
7. A final railed S-bend of ledges, one last sweeping laser, and the **GOAL**
   portal.

Difficulty notes: ledges are at least 3 tiles wide (marble diameter is 1) and
carry low bumper rails on every open edge, so a drift is a bounce rather than
a fall. Lasers are always visible: a live beam burns red, a safe beam turns
cool blue, and a beam flickers from blue toward red for 0.5 s before it goes
live. Sweeping lasers park, safe, for 2.5 s at each end of their sweep
(`dwell`), which is the crossing window. Gated lasers are safe for 2.8 s of
every 4 s. Jump pads solve
their own trajectory and their trigger is wider than the pad graphic.
Elevators are solid light columns (the shaft is never an open hole). The
reference route is verified end to end by the dev autopilot (see below).

Falling off, touching a live beam, or dropping into a void triggers a
glitch-burst reset at the last of five checkpoints. The system clock keeps
running, so resets cost time.

## Audio

The soundtrack, *Neon Grid Circuit (Main Theme)*, is an original composition
written for this project and dedicated to the public domain (CC0). Rather than
ship an MP3, `src/audio/Soundtrack.ts` *performs* it live with the Web Audio
API: a 112 BPM, eight-bar A-minor loop (Am F C G | Am F Dm E) with a
four-on-the-floor kick, claps, hats, a side-chained octave bass, a plucked
16th-note arpeggio through a dotted-eighth delay, detuned saw pads through a
convolution reverb, and a lead phrase over the second half of the loop.

Because the sequencer schedules every kick itself, the exact kick times are
known in advance. `beatEnergy()` returns a value that spikes to 1 on each kick
and decays exponentially, and it drives:

* grid-line brightness and edge opacity of every slab,
* bloom strength and chromatic aberration,
* the marble's core, halo and point light,
* jump-pad rings, elevator beams, the goal portal and the nebula.

Sound effects (`src/audio/Sfx.ts`) are synthesised on the same graph:
speed-driven rolling noise and hum, impacts scaled by the velocity change,
jump-pad sweeps, per-hazard death sounds, a checkpoint chime and a win
arpeggio. Audio unlocks on the first key press (browser autoplay policy).

## Project layout

```
src/
  main.ts               bootstrap + frame loop
  game/
    LevelData.ts        declarative level definition
    Level.ts            static geometry (merged grid meshes + fat-line edges)
    Dynamics.ts         jump pads, elevators, lasers, voids, checkpoints, goal
    Game.ts             state machine: intro -> play -> reset -> win
    Marble.ts           chrome shell, core, halo, light, trail, env map
    Burst.ts            neon shard particles for death/win
  physics/Physics.ts    Rapier wrapper + tuning constants
  render/
    Renderer.ts         isometric orthographic camera
    GridMaterial.ts     neon grid surface shader
    PostFX.ts           bloom + VCR pass
    Background.ts       nebula, floor grid, stars, data shards
  audio/                procedural soundtrack, SFX, glue
  input/Input.ts        keyboard -> screen-space axis
  ui/                   HUD + overlays
  debug/Autopilot.ts    dev-only waypoint driver used for automated play-tests
```

### Dev hooks

In development builds `window.__retro` exposes `game`, `input`, `autopilot`
and `debug`. `autopilot.start()` drives the marble around the reference
route (used to verify the course is completable end to end);
`debug.stepsPerFrame` / `debug.fixedDt` run the simulation faster than real
time for headless testing; `game.godMode` ignores hazard deaths.
