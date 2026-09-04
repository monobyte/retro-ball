# Phase 3 editor progress

The editor's document/command foundation is implemented and covered by five
Node tests. There is no editor UI yet, so none of P3-01–08 or G3 is complete.

`EditorModel` owns a cloned level document, selection, bounded undo/redo history
and optional local draft storage. Placement uses the runtime part registry;
move/rotate operations include checkpoint spawns and navigation positions.
Parameter edits use the same field constraints as level loading. Failed edits
are atomic. Deleting parts removes references owned by the document.

Draft validation permits a temporarily missing goal or unsupported spawn while
retaining schema, parameter-range and reference checks. Runtime loading,
importing complete courses, exporting and preparing a play-test always use full
validation. A failed play-test or import preserves the draft. Export preparation
does not mark the draft saved until the caller confirms the download was offered.

Selection prefabs store local positions and expose named parameters. Insertion
remaps instance IDs, reset groups, checkpoint numbers/policies, objectives,
signals and navigation IDs. Internal links follow the copied instances; links to
parts outside the selection are excluded. The original prefab is unchanged.
Undo/redo restores the same inserted IDs rather than allocating new ones.

Autosave uses an editor-only key. Recovery validates bounded draft data and is
undoable. Storage failures retain the live document and report the need to export.
Preparing play from spawn/checkpoint/position returns a detached validated copy;
the model has no physics, rendering, audio or campaign-save ownership.

Next: add the editor mode and viewport, typed palette/inspector, file and prefab
controls, validation overlays, metadata/objective/camera controls and return from
play-testing. Verify the full G3 workflow through the visible UI before closing
any phase gate. Actor/signal authoring will expand as their runtime systems arrive.
