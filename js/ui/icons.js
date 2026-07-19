/**
 * Shared UI icon markup. Icons inherit their colour from the control that
 * contains them, so every surface can style the same icon through CSS.
 */
const ICONS = Object.freeze({
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  edit: '<path d="m14.5 4.5 5 5-9.5 9.5H5v-5z"/><path d="m12.5 6.5 5 5"/>',
  rename: '<path d="M4 20h4l10.5-10.5-4-4L4 16v4zM13.5 6.5l4 4"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  export: '<path d="M12 15V3M8 7l4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v7M14 11v7"/>',
  play: '<path fill="currentColor" stroke="none" d="M8 5.5v13l10-6.5z"/>',
  pause: '<path fill="currentColor" stroke="none" d="M7 5h4v14H7zm6 0h4v14h-4z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
});

export function icon(name, className = '') {
  const markup = ICONS[name];
  if (!markup) throw new Error(`Unknown UI icon: ${ name }`);
  const classes = `ui-icon${ className ? ` ${ className }` : '' }`;
  return `<svg class="${ classes }" data-icon="${ name }" viewBox="0 0 24 24" aria-hidden="true">${ markup }</svg>`;
}
