# Phase 0 baseline — 4 September 2026

Baseline course/content: `9f93950`; planning baseline: `c70c1b8`. This report and
its evidence ship with the phase-0 commit. The legacy course remains the
regression fixture throughout the engine migration.

## Reference configuration

- MacBook Pro (Mac15,6), Apple M3 Pro, 12 CPU cores, 18 GB RAM.
- macOS 26.6.2 (25G83); Chrome for Testing 151, headless, ANGLE Metal M3 Pro.
- Node 22.22.0, pnpm 10.14.0, agent-browser 0.33.2; dependencies pinned by
  `pnpm-lock.yaml`. CI uses Node 22 and pnpm 10 with frozen installation.
- Keyboard input. Controller and actual 30/120 Hz display tests belong to phase 2.
- 1511 × 862 CSS pixels, emulated DPR 1 and 2. Each DPR change reloads the game
  so WebGL's drawing buffer really changes; JSON records its dimensions.
- Future release matrix: Chrome/Edge on Windows, Chrome/Firefox/Safari on macOS.
  Those platforms are **not verified by this baseline**. Pin their available
  versions when running the phase-9 matrix; this reference is a regression anchor,
  not a claim of broad browser support.

| Preset | Pixel ratio cap | AA | Bloom | Nebula scale |
| --- | --- | --- | --- | --- |
| Low | 1 | Off | Off | 0.25 |
| Standard | 2 | Off | On | 0.25 |
| High | 2 | On | On | 1 |

Shipping defaults remain 60 FPS cap, pixel ratio cap 2, AA off, bloom on and
quarter-resolution nebula. Both audio categories default on. Benchmarks disable
the frame cap, use one 1/60 simulation update per frame and silence game audio.
They sample checkpoint A after 60 warmup frames for 240 measured frames per
preset. This is a reproducible stationary scene; it is not a busy-arena stress
measurement or a GPU timer query. JavaScript submission time excludes GPU work;
rAF cadence includes scheduling and display refresh limits.

## Reproduction

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm dev --host 127.0.0.1
# In another terminal, with agent-browser 0.33.2 installed:
pnpm test:browser
pnpm benchmark:browser
```

Both scripts use `/tmp/retro-ball-checks` for output by default. Override
`EVIDENCE_DIR`, `BROWSER_SESSION` or `GAME_URL` as needed. Run them sequentially
in a dedicated browser session. The course/void checks intentionally reset game
state. The browser suite opens the game, unlocks audio, exercises actual Settings
buttons, reloads saved preferences, and runs the reference route with hazards on.
It fails on a missing AudioContext, timeout, invalid HDR value, GL error, trapped
marble, muted-output leak or course failure. Benchmarking is diagnostic and does
not silently turn the selected budgets into passing assertions.

The main deployment build now runs typechecking and Node tests before publishing.
A separate check workflow covers pull requests and non-main pushes. GPU/audio
checks are repeatable local checks: hosted Linux runners do not reproduce the
M3/Metal driver, display timing or audio device. CI build success alone does not
constitute a rendering, audio or performance pass.

A clean copy of source, tests, scripts and lockfile, without `node_modules`, was
installed using `pnpm install --frozen-lockfile`; all six Node tests and the
production build passed. Vite's existing large-bundle warning remains: the JS
bundle is approximately 3.52 MB raw / 1.27 MB gzip, including Rapier.

## Validation evidence

- [Normal HDR matrix](evidence/phase-0/rendering-normal.json) and
  [Retina HDR matrix](evidence/phase-0/rendering-retina.json): 32 scenarios each,
  scene and post-processing half-float pixels checked at five checkpoints,
  two elevators and goal, AA/bloom on/off.
- [Void checks](evidence/phase-0/voids.json): nine holes × five drop positions,
  all 45 fall deaths and checkpoint-B respawns passed.
- [Audio checks](evidence/phase-0/audio.json): four category combinations,
  real dry/reverb bus output, master mute/unmute, retained source volumes,
  UI selected state and storage round-trip. Suite also navigates/reloads with
  music off and FX on and checks preferences before audio startup.
- [Course completion](evidence/phase-0/completion.json): all 49 waypoints,
  hazards enabled, WIN, three resets. This is automated route evidence, not a
  human enjoyment test.
- [Settings at checkpoint A](evidence/phase-0/settings.png) and
  [completed course](evidence/phase-0/completed-course.png). The settings panel
  exposes both audio controls and remains scrollable in shorter windows.

Music and FX now have separate output gates **after** their dry/reverb paths.
Master mute gates their combined output without changing saved category choices
or per-source volumes. Category switching uses a short gain ramp to avoid clicks;
initial settings are applied before scheduling music. The soundtrack clock keeps
running when muted so visual timing remains stable.

## Measurements and initial budgets

These values come from the checked-in [DPR 1](evidence/phase-0/performance-dpr1.json)
and [DPR 2](evidence/phase-0/performance-dpr2.json) samples. Times below are p95
milliseconds; physics is the total `world.step` cost for a rendered frame.

| DPR | Preset | Frame interval | Game update | Physics | Render submission | Draw calls p95 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | low | 16.70 | 0.60 | 0.20 | 1.40 | 49 |
| 1 | standard | 16.70 | 0.50 | 0.20 | 1.30 | 57 |
| 1 | high | 16.80 | 0.30 | 0.10 | 1.10 | 57 |
| 2 | low | 16.70 | 0.40 | 0.20 | 1.10 | 48 |
| 2 | standard | 16.70 | 0.30 | 0.20 | 1.00 | 57 |
| 2 | high | 25.00 | 0.60 | 0.20 | 1.30 | 57 |

The standard preset sustains the reference refresh cadence. High at Retina has
25 ms p95 intervals and **does not meet the 60 FPS target**; it remains optional.
Keeping AA off and quarter-resolution nebula as defaults is supported by this
measurement. Optimise high quality before promising 60 FPS at that setting.

The game-ready development hook appeared at 87.4 / 89.4 ms after navigation on
this warm localhost run. This includes renderer/physics/game setup but excludes
first shader compilation and network delivery; it is not an internet cold-load
claim. Production transfer size is recorded above.

Use these provisional investigation thresholds while building the engine:

| Metric | Initial threshold | Scope |
| --- | --- | --- |
| Frame interval p95 | ≤17 ms standard, ≤33.4 ms optional high | Same reference viewport/hardware; 60 FPS remains the standard target |
| Game update p95 | ≤2 ms | Legacy fixture; includes physics |
| Physics steps p95 | ≤0.5 ms per frame | Legacy fixture at two 120 Hz steps per update |
| Render submission p95 | ≤3 ms | CPU only, legacy fixture |
| Draw calls | ≤80 | Whole frame, all passes, legacy checkpoint A |
| Resources | ≤180 geometries, 22 textures, 32 programs | Warm legacy fixture; measured 164–168 / 8–19 / 22–29 |
| Physics ownership | Exactly 3 bodies / 99 colliders | Loaded legacy fixture; zero session objects after disposal in phase 1 |
| Warm localhost game-ready | ≤500 ms | Same dev environment, not a shipping network SLA |
| Compressed JS | Investigate above 1.5 MB | Current 1.27 MB; split/reduce before materially expanding payload |

Resource counts are diagnostic object counts, not VRAM bytes. Random background
content means geometry counts vary between fresh loads. Phase 1 must prove no
accumulation across twenty level cycles; these one-session measurements cannot
prove teardown. Busy encounters, large arenas, audio CPU load and cold production
loading must be measured when those fixtures exist, before release sign-off.

## Implementation decisions

Proceed with the approved specification: a dedicated Retro Ball engine, one hub,
three regions × four courses, three opponents plus a guide, three soundtracks,
internal editor and local saves. First-region production must prove speed,
puzzle and exploration play before the other nine courses. The original course
is retained separately; it does not count toward the twelve new campaign courses.

Keep static hosting, Three.js, Rapier's 120 Hz simulation and procedural Web Audio.
Use a versioned serialisable document and component registry in phase 1; avoid
online services or a generic engine abstraction. Unusual geometry/physics and
regional palettes are open to creative trials in phase 6. No public-content
service, multiplayer or monetisation is implied.
