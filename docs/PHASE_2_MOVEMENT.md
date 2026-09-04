# Phase 2 movement progress

Phase 2 is in progress. Camera zones, scenery occlusion handling, landing
feedback and a Sightlines fixture are implemented but still need acceptance
validation. The final acceptance gate remains open.

## Commit checkpoint

The current work is committed at the user's request before the phase gate.
All 15 Node tests and the production build pass. The camera/contact browser
check fails with `Missed landing at 30 Hz`; its later camera, occlusion and
course-completion assertions therefore have not been reached. Diagnose that
failure, visually check occlusion and rerun the full browser regression suite
before marking the remaining phase tasks complete. Physical controller and
display testing also remain unverified.

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

Standard track retains the original friction, restitution and acceleration.
Ice reduces steering grip and braking, rubber grips and rebounds, and rough
track adds drag. Surface profiles feed collider properties, control forces,
shader markings, HUD contact labels and rolling/braking sound parameters.
The Grip Lab is a playable four-surface test course in the relay catalogue.

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
| ice | 1.21 | 4.43 | 15.13 |
| rubber | 0.23 | 0.73 | 2.10 |
| rough | 0.23 | 0.72 | 2.01 |

[Movement evidence](evidence/phase-2/movement.json) records all 36 combinations:
four surfaces × three approach speeds × 30/60/120 Hz simulated frame cadences.
Stopping-distance spread stays below 0.04 units across those cadences. This
checks simulation independence; actual display latency and physical controller
comfort still need hardware play-testing.

The same browser check completes Grip Lab through all four surfaces without
resets, completes Relay / 01 with keyboard and standard-controller API input,
and verifies disconnect/pause/neutral/reconnect/resume behaviour.

Fourteen Node tests and the production build pass. The legacy HDR, audio, void,
course and twenty-cycle teardown suite passed after the initial input/surface
changes. Run it again at the final phase-2 gate after camera/feedback work.

## Reproduce

Run the dev server and open it with agent-browser, then evaluate
`tests/movement.browser.js`. The script deliberately replaces game state, loads
large physics fixtures, samples braking and restores the browser gamepad provider
before returning to the relay. Run `npm test` for binding, dead-zone, input-edge,
neutral gating, migration and existing layout/content checks.
