/**
 * Close a native dialog when its backdrop is clicked.
 *
 * A dialog receives events whose target is itself for backdrop interaction.
 * Requiring the mousedown to begin there avoids closing when a drag starts in
 * the dialog content and ends on its backdrop. Property handlers are replaced
 * on each modal open, matching the lifecycle of the callers.
 *
 * @param {HTMLDialogElement} dialog
 * @param {() => void} onDismiss
 */
export function installBackdropDismissal(dialog, onDismiss) {
  let mouseDownOnBackdrop = false;
  dialog.onmousedown = (event) => {
    mouseDownOnBackdrop = event.target === dialog;
  };
  dialog.onclick = (event) => {
    if (event.target === dialog && mouseDownOnBackdrop) onDismiss();
  };
}
