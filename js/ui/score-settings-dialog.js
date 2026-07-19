const TEMPLATE = `
<dialog class="score-settings-dialog">
  <form method="dialog" class="score-settings-card">
    <header><div><p class="kicker">On the piano</p><h2>Score settings</h2></div><button value="cancel" class="close-button" aria-label="Close score settings">×</button></header>
    <div class="settings-grid">
      <label class="tempo-control"><span>Tempo</span><div><input data-field="tempo" type="range" min="40" max="180"><output>100</output><small>BPM</small></div></label>
      <label><span>Meter</span><select data-field="timeSig"><option>3/4</option><option>4/4</option><option>5/4</option><option>7/4</option><option>6/8</option></select></label>
      <label><span>Key signature</span><select data-field="key"><option value="-3">E♭ · 3 flats</option><option value="-2">B♭ · 2 flats</option><option value="-1">F · 1 flat</option><option value="0">C · no accidentals</option><option value="1">G · 1 sharp</option><option value="2">D · 2 sharps</option><option value="3">A · 3 sharps</option></select></label>
      <label><span>Clef</span><select data-field="clef"><option value="auto">Auto</option><option value="treble">Treble</option><option value="bass">Bass</option></select></label>
    </div>
    <p class="field-note">Key signature changes matching natural material and notation spelling; it is not proof of a tonal center.</p>
  </form>
</dialog>`;

export function mountScoreSettingsDialog({ container, callbacks }) {
  container.insertAdjacentHTML('beforeend', TEMPLATE);
  const dialog = container.querySelector('.score-settings-dialog');
  const tempo = dialog.querySelector('[data-field="tempo"]');
  const tempoOutput = tempo.parentElement.querySelector('output');
  const meter = dialog.querySelector('[data-field="timeSig"]');
  const key = dialog.querySelector('[data-field="key"]');
  const clef = dialog.querySelector('[data-field="clef"]');

  tempo.oninput = () => { tempoOutput.value = tempo.value; callbacks.onTempoInput(Number(tempo.value)); };
  meter.onchange = () => { const [num, den] = meter.value.split('/').map(Number); callbacks.onTimeSigChange({ num, den }); };
  key.onchange = () => callbacks.onKeyChange(Number(key.value));
  clef.onchange = () => callbacks.onClefChange(clef.value);

  return {
    open() { dialog.showModal(); },
    close() { dialog.close(); },
    render(settings) {
      tempo.value = String(settings.tempo); tempoOutput.value = String(settings.tempo);
      meter.value = `${ settings.timeSig.num }/${ settings.timeSig.den }`;
      key.value = String(settings.key); clef.value = settings.clef;
    },
  };
}
