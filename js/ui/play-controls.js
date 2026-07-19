export function mountPlayControls({ container, callbacks }) {
  container.innerHTML = `<section class="play-controls" hidden aria-label="Performance controls"><button data-action="pause">Pause</button><button data-action="replay">Replay</button><button data-action="stop">Stop · return to edit</button><button data-action="undo" hidden>Undo LEGATO changes</button></section>`;
  const root = container.querySelector('.play-controls');
  const pause = root.querySelector('[data-action="pause"]');
  const undo = root.querySelector('[data-action="undo"]');
  pause.onclick = () => callbacks.onPauseToggle();
  root.querySelector('[data-action="replay"]').onclick = () => callbacks.onReplay();
  root.querySelector('[data-action="stop"]').onclick = () => callbacks.onStop();
  undo.onclick = () => callbacks.onUndo();
  return {
    show() { root.hidden = false; },
    hide() { root.hidden = true; },
    setPaused(value) { pause.textContent = value ? 'Resume' : 'Pause'; },
    setUndoAvailable(value) { undo.hidden = !value; },
  };
}
