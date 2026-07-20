# Drag-to-reorder chord cards

Users can reorder the chords in a progression by dragging the grip handle at
the left edge of each chord card. Neighbouring cards animate out of the way
to preview the drop position; on release the progression re-compiles, the
sheet music re-renders, and the transition seams are reconciled.

## Interaction

- **Where to grab:** a six-dot grip icon in the slim gutter just inside each
  card's accent stripe (`.chord-drag-handle` in
  [css/editor-pane.css](../css/editor-pane.css)).
- **What you see mid-drag:** the moving card lifts slightly with a shadow;
  the position it left behind is drawn as a dashed accent outline
  (`.chord-row--drag-ghost`). Surrounding cards slide smoothly to make room
  — the FLIP animation is SortableJS's `animation: 200` option, no custom
  keyframes.
- **Transitions during a drag:** transition seams are interleaved between
  chord rows in the DOM but are not themselves draggable. They fade out for
  the duration of the drag (`.progression-list--dragging .transition-seam`)
  and are rebuilt in place by the post-reorder re-render.

## Seam behaviour after a reorder

A seam survives a reorder only if the exact ordered adjacency it belonged to
(`chordA.id -> chordB.id`) still exists in the new order. Adjacencies that
change are reset to a direct (no-technique) transition. This is handled by
`reconcileSeams()` in [js/state.js](../js/state.js), the same function used
for delete and insert — the reorder path just plugs into `replaceChords()`
in [js/views/editor-view.js](../js/views/editor-view.js) so nothing new was
needed on the state side.

If the currently selected seam belongs to an adjacency the reorder invalidated,
the expanded seam editor collapses automatically on the next render — the
editor panel prunes any expanded seam whose index falls out of range or
whose adjacency is no longer set to a technique.

## Files touched

| File | Role |
| ---- | ---- |
| [index.html](../index.html) | Loads SortableJS from jsdelivr. |
| [js/ui/icons.js](../js/ui/icons.js) | Adds the `grip` icon (six dots). |
| [js/ui/editor-panel.js](../js/ui/editor-panel.js) | Renders the handle on each row, initialises SortableJS on the progression list, exposes `unmount()`. |
| [js/views/editor-view.js](../js/views/editor-view.js) | `onReorderChords` callback routes the new chord order through `replaceChords()`; the panel's `unmount()` is called during view teardown. |
| [css/editor-pane.css](../css/editor-pane.css) | Adds the handle column to `.chord-row`, styles the handle, drag-state classes, and seam fade-out. |

## Known limitations

- **Keyboard-only reordering is not wired.** SortableJS is pointer-driven; a
  future pass could add up/down key handling on `.chord-drag-handle` for
  accessibility. The handle carries `tabindex="-1"` today to keep it out of
  the tab order rather than expose an unusable focus stop.
- **Reordering mid-playback stops playback.** This follows the existing
  `rerender()` contract — every structural mutation resets the transport
  before recompiling.
