/**
 * Editor view — the two-pane composition workspace.
 *
 * This is the previous `main.js` logic wrapped in a mount/unmount contract
 * so the router can swap between landing and editor. All state (progression,
 * segments, selectedSeam, key-source maps) lives locally in `mount()` — no
 * module-level singletons, so navigating away and back gives a clean slate.
 *
 *   UI mutates progression → compile() → segments
 *                                       → sheetMusic.render()
 *                                       → playSegments()
 *                                       → sheetMusic.setActiveMeasure()
 *
 * On top of every mutation, `scheduleAutosave()` debounces a write to the
 * ProjectStore so localStorage stays in sync without a manual save button.
 */
import { compile, makeChord, reconcileSeams, beatsToBars, isTechniqueUsable } from '../state.js';
import { chordDisplayName } from '../engine/chords.js';
import { TECHNIQUES } from '../engine/techniques.js';
import { evaluateAllTechniques } from '../engine/technique-eligibility.js';
import { playSegments, stopPlayback, pausePlayback, resumePlayback } from '../audio/playback.js';
import { openPianoModal, populateChordControls } from '../ui/piano-modal.js';
import { openProjectSettingsModal } from '../ui/project-settings-modal.js';
import { mountEditorPanel } from '../ui/editor-panel.js';
import { mountSheetMusicPanel } from '../ui/sheet-music-panel.js';
import { mountTransport } from '../ui/transport.js';
import { mountCoachPanel } from '../ui/coach-panel.js';
import { buildCoachEvidence } from '../coach/evidence.js';
import { requestCoach } from '../coach/coach.js';
import { navigate, LANDING_HASH } from '../router.js';

const SHELL_TEMPLATE = `
  <div class="app-shell">
    <aside id="editor-pane-mount"></aside>
    <main id="sheet-music-pane-mount"></main>
  </div>
`;

const AUTOSAVE_DEBOUNCE_MS = 500;

/**
 * @param {{ store: ReturnType<import('../persistence.js').createProjectStore>, pianoDialog: any, projectSettingsDialog: any }} deps
 */
export function createEditorView({ store, pianoDialog, projectSettingsDialog }) {
  return {
    async mount(root, params) {
      const project = await store.getProject(params.id);
      if (!project || project.deletedAt) {
        navigate(LANDING_HASH);
        return { unmount() {} };
      }
      // Ensure the shared piano modal is populated for this session.
      populateChordControls(pianoDialog);

      // ── Local state (was module-level in the old main.js) ────────────
      let progression = project.progression;
      let currentName = project.name;
      let segments = [];
      let editingId = null;
      let selectedSeam = 0;

      // ── DOM shell + panels ──────────────────────────────────────────
      root.insertAdjacentHTML('beforeend', SHELL_TEMPLATE);
      const shell = root.querySelector('.app-shell');

      const sheetMusic = mountSheetMusicPanel({
        container: shell.querySelector('#sheet-music-pane-mount'),
        callbacks: {
          onEffectiveSettingsChange() {
            // Tempo/clef overrides don't touch progression state, but they do
            // affect what Play should schedule. Nothing else to do here — the
            // panel and audio scheduler both re-read effective settings on
            // demand.
          },
        },
      });

      const editor = mountEditorPanel({
        container: shell.querySelector('#editor-pane-mount'),
        callbacks: {
          onEditProjectSettings() {
            openProjectSettingsModal(projectSettingsDialog, {
              mode: 'edit',
              initial: {
                name: currentName,
                settings: {
                  tempo: progression.settings.tempo,
                  timeSig: { ...progression.settings.timeSig },
                  key: progression.settings.key,
                  clef: progression.settings.clef,
                },
              },
              onSubmit: ({ name, settings }) => applyProjectSettings({ name, settings }),
            });
          },
          onAddChord() {
            editingId = null;
            openPianoModal(pianoDialog, null, saveChord, progression.settings.timeSig, progression.settings.key);
          },
          onEditChord(chord) {
            editingId = chord.id;
            openPianoModal(pianoDialog, chord, saveChord, progression.settings.timeSig, progression.settings.key);
          },
          onDeleteChord(chord) {
            replaceChords(progression.chords.filter((item) => item.id !== chord.id));
          },
          onSetChordBeats(chord, beats) {
            chord.bars = beatsToBars(beats, progression.settings.timeSig);
            resetIneligibleSeams();
            rerender();
          },
          onSelectSeam(index) {
            selectedSeam = index;
            editor.render({ progression, selectedSeam, projectName: currentName });
            coach.setContext(coachContextText());
          },
          onSetSeamTechnique(index, techniqueId) {
            progression.seams[index] = techniqueId;
            selectedSeam = index;
            coach.setEmpty();
            rerender();
          },
          onExplainSeam(index) { explainSeam(index); },
          onGoHome() {
            navigate(LANDING_HASH);
          },
          onRenameProject(name) {
            const clean = name.trim() || 'Untitled project';
            currentName = clean;
            scheduleAutosave();
            editor.render({ progression, selectedSeam, projectName: currentName });
          },
        },
      });

      const transport = mountTransport({
        container: sheetMusic.transportMount,
        callbacks: {
          onPlayToggle: handlePlayToggle,
          onStop: handleStop,
        },
      });

      const coach = mountCoachPanel({
        container: sheetMusic.coachMount,
        callbacks: {
          onRetry(retryIndex) { explainSeam(retryIndex); },
        },
      });

      // ── Autosave ────────────────────────────────────────────────────
      let saveTimer = null;
      let saveInFlight = false;

      function scheduleAutosave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSave, AUTOSAVE_DEBOUNCE_MS);
      }

      async function flushSave() {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        if (saveInFlight) return;
        saveInFlight = true;
        try {
          await store.saveProject({
            ...project,
            name: currentName,
            progression,
          });
        } catch (error) {
          transport.setStatus(error.message);
        } finally {
          saveInFlight = false;
        }
      }

      const beforeUnload = () => { flushSave(); };
      window.addEventListener('beforeunload', beforeUnload);

      // ── State mutation helpers (behavior identical to old main.js) ──
      function replaceChords(nextChords) {
        progression.seams = reconcileSeams(progression.chords, progression.seams, nextChords);
        progression.chords = nextChords;
        resetIneligibleSeams();
        selectedSeam = Math.min(selectedSeam, Math.max(0, progression.seams.length - 1));
        rerender();
      }

      function applyProjectSettings({ name, settings }) {
        const previous = progression.settings;
        const timeSigChanged = previous.timeSig.num !== settings.timeSig.num || previous.timeSig.den !== settings.timeSig.den;
        const keyChanged = previous.key !== settings.key;
        const clefChanged = previous.clef !== settings.clef;
        const nameChanged = currentName !== name;

        currentName = name;
        progression.settings = {
          tempo: settings.tempo,
          timeSig: { ...settings.timeSig },
          key: settings.key,
          clef: settings.clef,
        };

        // Key is spelling only: it never mutates chord.notes. Transposition is
        // a separate future feature. Time signature can invalidate technique
        // seam beat-costs, so those still get re-checked here.
        if (timeSigChanged) resetIneligibleSeams();
        if (keyChanged || timeSigChanged || clefChanged) coach.setEmpty();

        if (keyChanged || timeSigChanged || clefChanged || nameChanged) {
          rerender();
        } else {
          scheduleAutosave();
        }
      }

      function resetIneligibleSeams() {
        progression.seams = progression.seams.map((techniqueId, index) => {
          if (!techniqueId) return null;
          const technique = evaluateAllTechniques(progression.chords[index], progression.chords[index + 1])
            .find((candidate) => candidate.id === techniqueId);
          return technique?.valid && isTechniqueUsable(technique, progression.chords[index], progression.settings.timeSig)
            ? techniqueId
            : null;
        });
      }

      function saveChord(input) {
        if (editingId) {
          const chord = progression.chords.find((item) => item.id === editingId);
          const { hint: _oldHint, ...withoutHint } = chord;
          Object.assign(chord, withoutHint, input);
          if (!input.hint) delete chord.hint;
        } else {
          const chord = makeChord(input.notes, input.bars, input.hint);
          progression.chords.push(chord);
          if (progression.chords.length > 1) progression.seams.push(null);
        }
        resetIneligibleSeams();
        editingId = null;
        coach.setEmpty();
        rerender();
      }

      // ── Coach flow ──────────────────────────────────────────────────
      function coachContextText() {
        if (!progression.seams.length) return 'Add two chords to create a seam that LEGATO can explain.';
        const from = chordDisplayName(progression.chords[selectedSeam], progression.settings.key);
        const to = chordDisplayName(progression.chords[selectedSeam + 1], progression.settings.key);
        const technique = progression.seams[selectedSeam] ? TECHNIQUES[progression.seams[selectedSeam]].name : 'Direct transition';
        return `${ from } → ${ to } · ${ technique }`;
      }

      async function explainSeam(index) {
        selectedSeam = index;
        editor.render({ progression, selectedSeam, projectName: currentName });
        coach.setContext(coachContextText());
        const techniqueId = progression.seams[index];
        const payload = {
          fromChord: { name: chordDisplayName(progression.chords[index], progression.settings.key), notes: progression.chords[index].notes },
          toChord: { name: chordDisplayName(progression.chords[index + 1], progression.settings.key), notes: progression.chords[index + 1].notes },
          technique: techniqueId ? { id: techniqueId, ...TECHNIQUES[techniqueId] } : 'none',
          generatedNotes: segments.filter((segment) => segment.seamIndex === index).flatMap((segment) => segment.notes),
          evidence: buildCoachEvidence(progression, segments, index),
        };
        coach.setLoading();
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 20000);
          const result = await requestCoach(payload, { signal: controller.signal });
          clearTimeout(timer);
          coach.setResult(result);
        } catch (error) {
          const message = error.name === 'AbortError' ? 'The coach took too long to respond.' : error.message;
          coach.setError(message, index);
        }
      }

      // ── Transport ───────────────────────────────────────────────────
      /** @type {'idle' | 'playing' | 'paused'} */
      let playbackState = 'idle';

      function setPlaybackState(next) {
        playbackState = next;
        if (next === 'playing') transport.setPlayMode('pause');
        else if (next === 'paused') transport.setPlayMode('resume');
        else transport.setPlayMode('play');
      }

      function handlePlayToggle() {
        if (playbackState === 'playing') {
          pausePlayback();
          setPlaybackState('paused');
          transport.setPulseActive(false);
          transport.setStatus('Paused');
          sheetMusic.particles.settle({ preserveProgress: true });
        } else if (playbackState === 'paused') {
          resumePlayback();
          setPlaybackState('playing');
          transport.setPulseActive(true);
          transport.setStatus('Playing');
          sheetMusic.particles.beginPlayback();
        } else {
          startPlaybackFromStart();
        }
      }

      async function startPlaybackFromStart() {
        transport.setPlayEnabled(false);
        transport.setPulseActive(true);
        transport.setStatus('Loading piano…');
        sheetMusic.particles.beginPlayback();
        const playbackSettings = sheetMusic.getEffectiveSettings() ?? progression.settings;
        try {
          setPlaybackState('playing');
          transport.setPlayEnabled(true);
          await playSegments(
            segments,
            playbackSettings,
            (measure) => {
              sheetMusic.setActiveMeasure(measure);
              if (measure !== null) transport.setStatus(`Playing measure ${ measure + 1 }`);
            },
            () => {
              sheetMusic.particles.settle();
              setPlaybackState('idle');
              transport.setPlayEnabled(true);
              transport.setPulseActive(false);
              transport.setStatus('Playback complete');
            },
            (progress, measure) => sheetMusic.particles.setProgress(progress, measure),
          );
        } catch (error) {
          sheetMusic.particles.settle({ immediate: true });
          setPlaybackState('idle');
          transport.setPlayEnabled(true);
          transport.setPulseActive(false);
          transport.setStatus(error.message);
        }
      }

      function handleStop() {
        stopPlayback();
        // Full reset: no progress rail, no lingering "paused" glow — Stop
        // should look identical to the just-loaded state.
        sheetMusic.particles.settle({ immediate: true });
        sheetMusic.setActiveMeasure(null);
        setPlaybackState('idle');
        transport.setPlayEnabled(true);
        transport.setPulseActive(false);
        transport.setStatus('Stopped');
      }

      // ── Render pipeline ─────────────────────────────────────────────
      function rerender() {
        stopPlayback();
        sheetMusic.particles.settle({ immediate: true });
        sheetMusic.setActiveMeasure(null);
        setPlaybackState('idle');
        transport.setPlayEnabled(true);
        transport.setPulseActive(false);
        segments = compile(progression);
        editor.render({ progression, selectedSeam, projectName: currentName });
        sheetMusic.render(segments, progression.settings, progression.chords);
        coach.setContext(coachContextText());
        scheduleAutosave();
      }

      rerender();

      return {
        async unmount() {
          window.removeEventListener('beforeunload', beforeUnload);
          stopPlayback();
          await flushSave();
          root.replaceChildren();
        },
      };
    },
  };
}
