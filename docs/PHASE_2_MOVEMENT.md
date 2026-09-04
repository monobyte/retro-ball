# Phase 2 movement progress

Phase 2 was accepted on 4 September 2026. The user approved Sightlines, asked for
more distinct Grip Lab surfaces, and approved the revised lab: “all look good
now.” They requested continued implementation with further tuning later.
Physical device/display coverage remains an explicit P2-07 / P9-01 follow-up.

## Validation status

The missed landing at 30 Hz is fixed. The ground probe reached the floor one
physics step before the solver applied the bounce impulse, so relying on the
probe's transition misclassified landings as generic impacts. Landing feedback
now requires incoming normal velocity and an upward contact impulse, with a
cooldown. Four repeated drops (including rebounds) and wall contacts produce
12 landing cues and four wall cues at each simulated 30/60/120 Hz cadence.

Camera zones cover puzzle, vertical, speed and arena views. Priority and boundary
hysteresis prevent switching repeatedly at shared edges. Jump-pad framing keeps
both the marble and the next landing in view. Keyboard and standard-controller
API input each complete Sightlines at 30, 60 and 120 Hz simulation cadence with
no resets. Completion times differ by less than one 30 Hz frame.

Scenery opens a small viewing window around the marble when a physics ray detects
an obstruction. The [inspected screenshot](evidence/phase-2/occlusion.png) shows
the ball behind the tall wall. Hazard materials are unchanged. The initial
exploration fixture can be completed with the fixed isometric camera, so rotation
is not required. Landing rings, impact pulses, surface labels and skidding/braking
audio provide contact feedback; physics contact sampling runs at 120 Hz.

The full browser suite passes: normal/Retina HDR checks, 45 void drops, four audio
combinations, legacy completion (56.3 simulated seconds, three resets), 20 session
teardown cycles, braking, input recovery and camera/contact fixtures. Results are
stored in [phase-2 evidence](evidence/phase-2/). `npm run test:browser` now includes
the movement and camera/contact checks. Twenty Node tests (including five editor-foundation tests) and the build pass.

G2 is accepted following that human retest. P2-07 remains unchecked specifically
for physical controller/display coverage, carried into P9-01. Standard-controller
API and simulated 30/60/120 Hz checks pass; they do not claim hardware latency
or physical-device coverage. This exception is recorded rather than silently
counting the hardware matrix as tested.

## Controls

Keyboard actions now use a persistent action map. Settings → Controls lets the
player rebind roll, brake, interact, pause, retry, mute and menu actions. It also
sets controller dead zone and sensitivity. Conflicts are reported without
replacing the old binding. Space, F, Esc and Tab remain reserved; keyboard boot
still requires Space. Opening settings pauses an active course and closing it
resumes only when settings caused that pause.

Standard controller mapping uses left stick/D-pad for roll, LB or analogue LT
for braking, A for interact/menu confirm, Start for pause, Y for checkpoint retry
and B for menu back. Controller input must become neutral after connection,
reconnection, settings changes and reset. A disconnect pauses gameplay and clears
input; held controls cannot immediately move the ball on reconnect. Keyboard
and controller menu input share the configured action definitions.

Implementation follows the browser's [standard Gamepad mapping](https://www.w3.org/TR/gamepad/).
The automated controller fixture replaces the browser API provider with standard
button/axis values; it does not claim a physical controller was tested. The
initial Space audio unlock remains required before controller play.

## Surfaces and braking

Standard track retains the original friction, restitution, acceleration and
body damping. The revised profiles make ordinary rolling and turning distinct:
ice has low damping and weak steering, rubber resists lateral slip, and rough
track adds strong drag and limits powered speed. The earlier minimum friction
combine rule also capped rubber/rough grip at the ball's coefficient; those two
surfaces now use the maximum rule while ice keeps the minimum rule.

Surface physics, material colours, patterns and audio share profile metadata.
Ice is pale blue with broad fracture seams; rubber uses orange studs on dark
mats; rough track uses ochre granular tiles. These replace the base purple grid
on special surfaces. [Inspected material overview](evidence/phase-2/grip-materials.png).
Grip Lab's areas are now 18 × 26 units, giving players more time to steer and
release the controls on each surface. Surface labels explain drift, grip and drag.

Ordinary-motion measurements at simulated 60 Hz:

| Surface | Speed after 2 s input | Coast distance in 2 s from 8 u/s | Sideways drift during a 0.5 s turn |
| --- | --- | --- | --- |
| standard | 16.12 | 12.28 | 3.73 |
| ice | 14.36 | 15.69 | 3.98 |
| rubber | 14.08 | 6.14 | 1.00 |
| rough | 5.60 | 3.23 | 1.54 |

The same motions at 30/60/120 Hz stay within 0.06 units (or units/second for
speed). The turn begins with 8 u/s of sideways momentum and applies perpendicular
steering. This establishes a mechanical difference; the user accepted the revised look and feel in the follow-up play-test.

The brake opposes tangential motion and damps spin without removing the ball's
vertical velocity. Normal rolling still coasts; braking never creates an air
brake. Default keyboard brake is Shift. The test rebind to B was restored after
checking both the UI and saved settings.

Measured stopping distances below start with a settled rolling ball, matching
angular speed and full brake, with stop defined as horizontal speed below 0.1.
Distances are world units at simulated 60 Hz presentation / 120 Hz physics:

| Surface | From 4 u/s | From 8 u/s | From 16 u/s |
| --- | --- | --- | --- |
| standard | 0.29 | 0.88 | 2.48 |
| ice | 2.39 | 9.47 | 37.08 |
| rubber | 0.17 | 0.57 | 1.67 |
| rough | 0.21 | 0.61 | 1.63 |

[Movement evidence](evidence/phase-2/movement.json) records 12 ordinary-motion samples and all 36 braking combinations:
four surfaces × three approach speeds × 30/60/120 Hz simulated frame cadences.
Stopping-distance spread stays below 0.04 units across those cadences. This
checks simulation independence; actual display latency and physical controller
comfort still need hardware play-testing.

The same browser check completes Grip Lab through all four surfaces without
resets, completes Relay / 01 with keyboard and standard-controller API input,
and verifies disconnect/pause/neutral/reconnect/resume behaviour.

## Reproduce

Run the dev server and open it with agent-browser, then evaluate
`tests/movement.browser.js`. The script deliberately replaces game state, loads
large physics fixtures, samples braking and restores the browser gamepad provider
before returning to the relay. Run `npm test` for binding, dead-zone, input-edge,
neutral gating, migration and existing layout/content checks.
