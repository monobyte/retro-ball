# Phase 3 — The Workshop

P3-01–08 and G3 are complete. The Workshop is the internal course editor, available from the relay menu. It
uses the runtime level document and part registry. Edit mode owns no physics or
audio session; play-testing receives a detached, fully validated course copy.

## Authoring workflow

1. Open **WORKSHOP**. A saved local draft is recovered automatically when valid.
   **New** starts a simple floor and goal; undo can restore the previous draft.
2. Choose a part from the searchable palette, then click the canvas to place it.
   **Select** or Esc ends placement. Drag a part to move it. Shift adds/removes
   parts from the selection; drag empty space for box selection.
3. Use the inspector to resize, set surface/type-specific parameters or change
   position/elevation. Optional fields show **Default** when runtime defaults
   apply. Invalid parameter edits leave the document unchanged.
4. Set the grid interval and placement elevation in the toolbar. **This layer**
   filters to the chosen base elevation. Alt-drag or middle-drag pans; the wheel
   zooms. **Fit course** and **Frame selection** restore useful framing.
5. Save a selection as a prefab, optionally exposing named parameters. Expand the
   prefab in the library, set its exposed values, choose **Place prefab**, then
   click the canvas. Each placement allocates fresh IDs for its owned data.
6. Expand **Course / cameras** to edit metadata, spawn, objectives and camera
   zones. Checkpoints and goals create their required policy/objective records
   when placed. Checkpoint spawn coordinates are editable in its inspector.
   **Route from selection** records the order in which parts were selected.
7. Review validation. Overlapping floors are outlined red; clicking the report
   selects the exact offending pair. Bounds and marble-radius clearance outlines
   use the runtime's box conversion. Unsupported starts are marked red. A void
   marker cannot cut a hole in a floor: partition the surrounding floors first.
8. Choose play from spawn, checkpoint or the selected supported floor position.
   **Play test** opens the real game; Space begins play. **Return to editor**
   disposes the test session and restores the document and selection.
9. **Export** prepares a validated JSON download. **Import** loads a complete
   course through the same validation boundary as runtime loading. Undo restores
   the previous draft. Autosave and prefabs use separate editor-only local keys.

Keyboard shortcuts inside the canvas: Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z redo,
Cmd/Ctrl+D duplicate, R rotate 90 degrees, Delete/Backspace delete, arrows nudge,
Page Up/Down change elevation. Shift multiplies nudge distance by five. Enter or
Space selects a focused part; text fields keep their native editing shortcuts.

## State and identity guarantees

`EditorModel` owns a cloned document, selection and command history. One gesture
produces one undo transaction. History is bounded by count and serialized size.
Snapshots preserve inserted IDs across undo/redo. Move and rotate commands include
checkpoint spawns and navigation positions. Deletion removes owned references.

Draft validation permits temporarily missing goals or unsupported spawns while
retaining schema, parameter-range and reference checks. Runtime loading, complete
course import/export and play-test preparation always use full validation.
Rejected imports and failed play-tests preserve unsaved work. Storage errors
retain the live draft and tell the author to export it. There is no campaign-save
mutation in the editor or its test sessions.

Prefabs use local positions and shared runtime parameter definitions. Insertion
remaps instance IDs, reset groups, checkpoint numbers/policies, objectives,
signals and navigation IDs. Internal links follow copied instances; references
outside the selected section are excluded. The source prefab stays unchanged.
The library is local, bounded to 50 entries, and recovered on page reload.

The SVG canvas projects bounds from the runtime collider conversion rather than
maintaining separate floor dimensions. Elevation labels, layer filtering and the
real play-test view support stacked courses. This phase provides basic authoring;
swept danger volumes, signal wiring and actor-route tools arrive with their
runtime families in phases 4 and 5. Only the currently registered theme and
soundtrack appear in their selectors.

## Acceptance evidence

`npm run test:editor` drives the visible controls with DOM input events and real
browser pointer placement/dragging. It builds a five-part course, resizes floors,
saves and places a prefab with an exposed width override, selects overlapping
parts through validation, rotates/elevates groups, exercises undo/redo, exports,
rejects an invalid import, preserves edits after failed play, completes the
course without resets, returns unchanged, starts at checkpoint/selection, reloads
and recovers its draft/library, and imports the exported JSON. The script does
not edit the model directly. Screenshots cover 1280×800 and 960×640 windows.

All 21 Node tests and the production build pass. Six editor unit tests verify command atomicity, detached play documents, all
registry part defaults, reference remapping, checkpoint transforms, recovery,
storage failure, and precise overlap/blocked-void reports. The full game suite
checks HDR/MSAA at two pixel ratios, 45 void drops, audio toggles, legacy
completion, 20 session teardown cycles and movement/camera fixtures.

Run the dev server before browser checks:

```sh
npm test
npm run build
npm run test:editor
npm run test:browser
```

Evidence is saved under [phase-3 evidence](evidence/phase-3/). The authoring
workflow is automated UI evidence; it does not claim a separate human usability
study. Further editor onboarding/polish remains explicitly in phase 11.
