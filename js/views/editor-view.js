/**
 * Project workspace: one mounted Edit → Review → Play experience.
 * Progression remains the only stored musical truth; review, selection,
 * conversation, playback, and undo are session-only view state.
 */
import { compile, makeChord, reconcileSeams, beatsToBars, isTechniqueUsable } from '../state.js';
import { chordDisplayName } from '../engine/chords.js';
import { applyKeySignature } from '../engine/key-signature.js';
import { TECHNIQUES } from '../engine/techniques.js';
import { evaluateAllTechniques } from '../engine/technique-eligibility.js';
import { createPlaybackSession, stopPlayback } from '../audio/playback.js';
import { openPianoModal, populateChordControls } from '../ui/piano-modal.js';
import { mountEditorPanel } from '../ui/editor-panel.js';
import { mountSheetMusicPanel } from '../ui/sheet-music-panel.js';
import { mountStudioScene } from '../ui/studio-scene.js';
import { mountScoreSettingsDialog } from '../ui/score-settings-dialog.js';
import { mountLegatoAgent } from '../ui/legato-agent.js';
import { mountReviewPanel } from '../ui/review-panel.js';
import { mountPlayControls } from '../ui/play-controls.js';
import { feedbackForChange } from '../coach/feedback-rules.js';
import { normalizeReview, reviewPreviews, selectedChanges } from '../coach/review.js';
import { buildCoachEvidence } from '../coach/evidence.js';
import { requestCoach, requestProgressionReview } from '../coach/coach.js';
import { navigate, editorHash, LANDING_HASH } from '../router.js';

const AUTOSAVE_DEBOUNCE_MS = 450;
const TRANSITION_MS = 1900;

export function createEditorView({ store, pianoDialog, exampleProgressionFactory }) {
  return {
    async mount(root, params) {
      if (params.legacy) {
        navigate(editorHash(params.id));
        return { unmount() {} };
      }
      const project = await store.getProject(params.id);
      if (!project || project.deletedAt) {
        navigate(LANDING_HASH);
        return { unmount() {} };
      }
      populateChordControls(pianoDialog);

      let progression = project.progression;
      let currentName = project.name;
      let segments = [];
      let editingId = null;
      let selectedSeam = Math.min(0, Math.max(0, progression.seams.length - 1));
      let selectedChordId = progression.chords[0]?.id ?? null;
      let playbackSession = null;
      let reviewController = null;
      let currentReview = null;
      let undoSnapshot = null;
      let transitionTimer = 0;
      let reviewNudgeTimer = 0;
      let localFeedbackTimer = 0;
      let destroyed = false;
      const keySourceNotes = new Map();
      const keySourceHints = new Map();

      const scene = mountStudioScene({
        container: root,
        callbacks: {
          onGoHome: leaveWorkspace,
          onProceed: handleProceed,
          onOpenSettings: () => settingsDialog.open(),
          onAskLegato: () => agent.openComposer({ context: currentQuestionContext() }),
          onRenameProject: renameProject,
        },
      });

      const score = mountSheetMusicPanel({
        container: scene.scoreMount,
        callbacks: {
          onSelectChord(chordId) { selectChord(chordId); },
          onSelectSeam(index) { selectSeam(index); },
        },
      });

      const inspector = mountEditorPanel({
        container: scene.inspectorMount,
        callbacks: {
          onAddChord() { editingId = null; openPianoModal(pianoDialog, null, saveChord, progression.settings.timeSig, progression.settings.key); },
          onEditChord(chord) { editingId = chord.id; openPianoModal(pianoDialog, chord, saveChord, progression.settings.timeSig, progression.settings.key); },
          onDeleteChord(chord) { replaceChords(progression.chords.filter((item) => item.id !== chord.id), { type: 'deleteChord' }); },
          onSetChordBeats(chord, beats) { chord.bars = beatsToBars(beats, progression.settings.timeSig); resetIneligibleSeams(); changed({ type: 'beats' }); },
          onSelectChord(chordId) { selectChord(chordId); },
          onSelectSeam(index) { selectSeam(index); },
          onSetSeamTechnique(index, techniqueId) { progression.seams[index] = techniqueId; selectedSeam = index; selectedChordId = null; changed({ type: 'technique', techniqueId }); },
          onAskSeam(index) {
            selectSeam(index);
            agent.openComposer({ prefill: 'What should I listen for in this transition?', context: { kind: 'seam', seamIndex: index } });
          },
          onRenameProject: renameProject,
          onLoadExample: loadExample,
        },
      });

      const settingsDialog = mountScoreSettingsDialog({
        container: root,
        callbacks: {
          onTempoInput(tempo) { progression.settings.tempo = tempo; changed({ type: 'tempo' }); },
          onTimeSigChange(timeSig) { progression.settings.timeSig = timeSig; resetIneligibleSeams(); changed({ type: 'timeSig' }); },
          onKeyChange(key) { progression.settings.key = key; applyKeyToMaterial(); changed({ type: 'key' }); },
          onClefChange(clef) { progression.settings.clef = clef; changed({ type: 'clef' }); },
        },
      });

      const agent = mountLegatoAgent({
        container: scene.agentMount,
        callbacks: { onQuestion: askLegato },
      });

      const reviewPanel = mountReviewPanel({
        container: scene.reviewMount,
        callbacks: {
          onReturn: returnToEdit,
          onRetry: handleProceed,
          onIgnore: () => beginPlay({ useSuggestions: false }),
          onApply: (indexes) => applyReviewAndPlay(indexes),
        },
      });

      const playControls = mountPlayControls({
        container: scene.playControlsMount,
        callbacks: {
          onPauseToggle: togglePause,
          onReplay: replay,
          onStop: stopToEdit,
          onUndo: undoLegatoChanges,
        },
      });

      // ── Autosave ──────────────────────────────────────────────────
      let saveTimer = 0;
      let savePromise = null;
      let saveAgain = false;

      function scheduleAutosave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => flushSave(), AUTOSAVE_DEBOUNCE_MS);
      }

      async function flushSave() {
        clearTimeout(saveTimer); saveTimer = 0;
        if (savePromise) { saveAgain = true; await savePromise; return flushSave(); }
        savePromise = store.saveProject({ ...project, name: currentName, progression })
          .catch((error) => scene.setStatus(error.message))
          .finally(() => { savePromise = null; });
        await savePromise;
        if (saveAgain) { saveAgain = false; return flushSave(); }
      }

      const beforeUnload = () => { flushSave(); };
      window.addEventListener('beforeunload', beforeUnload);

      // ── Mutations ─────────────────────────────────────────────────
      function rememberKeySources(chords, { overwrite = false } = {}) {
        chords.forEach((chord) => {
          if (overwrite || !keySourceNotes.has(chord.id)) keySourceNotes.set(chord.id, [...chord.notes]);
          if (overwrite || !keySourceHints.has(chord.id)) keySourceHints.set(chord.id, chord.hint ? { ...chord.hint } : null);
        });
      }

      function applyKeyToMaterial() {
        rememberKeySources(progression.chords);
        progression.chords.forEach((chord) => {
          const sourceNotes = keySourceNotes.get(chord.id) ?? chord.notes;
          chord.notes = applyKeySignature(sourceNotes, progression.settings.key);
          const changedNotes = chord.notes.some((note, index) => note !== sourceNotes[index]);
          if (changedNotes) delete chord.hint;
          else if (keySourceHints.get(chord.id)) chord.hint = { ...keySourceHints.get(chord.id) };
        });
        resetIneligibleSeams();
      }

      function resetIneligibleSeams() {
        progression.seams = progression.seams.map((techniqueId, index) => {
          if (!techniqueId) return null;
          const technique = evaluateAllTechniques(progression.chords[index], progression.chords[index + 1])
            .find((candidate) => candidate.id === techniqueId);
          return technique?.valid && isTechniqueUsable(technique, progression.chords[index], progression.settings.timeSig) ? techniqueId : null;
        });
      }

      function replaceChords(nextChords, change) {
        progression.seams = reconcileSeams(progression.chords, progression.seams, nextChords);
        progression.chords = nextChords;
        rememberKeySources(nextChords);
        resetIneligibleSeams();
        selectedChordId = nextChords.some((chord) => chord.id === selectedChordId) ? selectedChordId : nextChords[0]?.id ?? null;
        selectedSeam = Math.min(selectedSeam, Math.max(0, progression.seams.length - 1));
        changed(change);
      }

      function saveChord(input) {
        const wasEditing = Boolean(editingId);
        if (wasEditing) {
          const chord = progression.chords.find((item) => item.id === editingId);
          const { hint: _oldHint, ...withoutHint } = chord;
          Object.assign(chord, withoutHint, input);
          keySourceNotes.set(chord.id, [...input.notes]);
          keySourceHints.set(chord.id, input.hint ? { ...input.hint } : null);
          chord.notes = applyKeySignature(input.notes, progression.settings.key);
          if (!input.hint) delete chord.hint;
          selectedChordId = chord.id;
        } else {
          const chord = makeChord(input.notes, input.bars, input.hint);
          keySourceNotes.set(chord.id, [...input.notes]);
          keySourceHints.set(chord.id, input.hint ? { ...input.hint } : null);
          chord.notes = applyKeySignature(input.notes, progression.settings.key);
          progression.chords.push(chord);
          if (progression.chords.length > 1) progression.seams.push(null);
          selectedChordId = chord.id;
        }
        resetIneligibleSeams();
        editingId = null;
        changed({ type: wasEditing ? 'editChord' : 'addChord' });
      }

      function renameProject(name) {
        currentName = name.trim() || 'Untitled project';
        renderPanels();
        scheduleAutosave();
      }

      function loadExample() {
        progression = exampleProgressionFactory();
        keySourceNotes.clear(); keySourceHints.clear();
        rememberKeySources(progression.chords, { overwrite: true });
        selectedChordId = progression.chords[0]?.id ?? null; selectedSeam = 0;
        undoSnapshot = null;
        changed({ type: 'default' });
        scene.setStatus('Example restored');
      }

      function changed(change) {
        undoSnapshot = null;
        stopPlayback();
        segments = compile(progression);
        clearTimeout(localFeedbackTimer);
        const activityMode = agent.getActivityMode();
        if (activityMode === 'proactive' || (activityMode === 'important' && isImportantChange(change))) {
          localFeedbackTimer = setTimeout(() => agent.setReaction(feedbackForChange(change, progression)), 280);
        }
        scene.setStatus('Saved locally');
        renderPanels();
        scheduleAutosave();
      }

      // ── Selection and questions ───────────────────────────────────
      function selectChord(chordId) {
        selectedChordId = chordId; selectedSeam = -1;
        inspector.render({ progression, selectedSeam, selectedChordId, projectName: currentName });
        inspector.scrollToChord(chordId); score.selectChord(chordId);
        agent.setContext({ kind: 'chord', chordId });
      }

      function selectSeam(index) {
        selectedSeam = index; selectedChordId = null;
        inspector.render({ progression, selectedSeam, selectedChordId, projectName: currentName });
        inspector.scrollToSeam(index); score.selectSeam(index);
        agent.setContext({ kind: 'seam', seamIndex: index });
      }

      function currentQuestionContext() {
        return selectedSeam >= 0 ? { kind: 'seam', seamIndex: selectedSeam } : { kind: 'chord', chordId: selectedChordId };
      }

      async function askLegato(question, context) {
        const seamIndex = context?.kind === 'seam' ? context.seamIndex : Math.max(0, Math.min(selectedSeam, progression.seams.length - 1));
        if (!progression.seams.length) {
          agent.appendMessage({ role: 'assistant', text: 'Add at least two chords and I can ground an answer in the transition between them.' });
          return;
        }
        agent.setThinking(true);
        try {
          const result = await requestCoach(buildSeamPayload(seamIndex, question));
          agent.appendMessage({ role: 'assistant', structured: result });
          agent.setReaction(result.whatYouHear);
        } catch (error) { agent.setError(error.message); }
      }

      function buildSeamPayload(index, question = '') {
        const techniqueId = progression.seams[index];
        return {
          question,
          fromChord: { name: chordDisplayName(progression.chords[index], progression.settings.key), notes: progression.chords[index].notes },
          toChord: { name: chordDisplayName(progression.chords[index + 1], progression.settings.key), notes: progression.chords[index + 1].notes },
          technique: techniqueId ? { id: techniqueId, ...TECHNIQUES[techniqueId] } : 'none',
          generatedNotes: segments.filter((segment) => segment.seamIndex === index).flatMap((segment) => segment.notes),
          evidence: buildCoachEvidence(progression, segments, index),
        };
      }

      // ── Proceed review ────────────────────────────────────────────
      async function handleProceed() {
        if (!segments.length) { agent.setReaction('Give me at least one voiced chord before we perform.'); return; }
        stopPlayback();
        clearTimeout(reviewNudgeTimer);
        reviewController?.abort();
        reviewController = new AbortController();
        scene.setMode('review');
        reviewPanel.showLoading();
        agent.setThinking(true);
        try {
          const raw = await requestProgressionReview({
            projectName: currentName,
            progression: clone(progression),
            segments,
            chordLabels: progression.chords.map((chord) => chordDisplayName(chord, progression.settings.key)),
            evidenceBySeam: progression.seams.map((_, index) => buildCoachEvidence(progression, segments, index)),
          }, { signal: reviewController.signal });
          currentReview = normalizeReview(raw, progression);
          reviewPanel.showResult(currentReview, reviewPreviews(currentReview, progression));
          agent.setReaction(currentReview.overview);
          reviewNudgeTimer = setTimeout(() => agent.showNudge('Feel free to discuss any ideas with me.'), 10000);
        } catch (error) {
          if (error.name === 'AbortError') return;
          reviewPanel.showError(error.message);
          agent.setError(error.message);
        }
      }

      function returnToEdit() {
        reviewController?.abort(); reviewController = null;
        clearTimeout(reviewNudgeTimer);
        currentReview = null; reviewPanel.hide();
        scene.setMode('edit'); scene.setStatus('Ready to compose');
      }

      async function applyReviewAndPlay(indexes) {
        if (!currentReview) return beginPlay({ useSuggestions: false });
        const changes = selectedChanges(currentReview, indexes);
        undoSnapshot = changes.length ? clone(progression) : null;
        applyReviewChanges(changes);
        resetIneligibleSeams();
        segments = compile(progression);
        renderPanels();
        await flushSave();
        playControls.setUndoAvailable(changes.length > 0);
        beginPlay({ useSuggestions: changes.length > 0 });
      }

      function applyReviewChanges(changes) {
        for (const change of changes) {
          if (change.kind === 'tempo') progression.settings.tempo = change.value;
          if (change.kind === 'key') { progression.settings.key = change.value; applyKeyToMaterial(); }
          if (change.kind === 'clef') progression.settings.clef = change.value;
          if (change.kind === 'meter') { const [num, den] = change.value.split('/').map(Number); progression.settings.timeSig = { num, den }; }
          if (change.kind === 'chordBeats') progression.chords[change.index].bars = beatsToBars(change.value, progression.settings.timeSig);
          if (change.kind === 'chordVoicing') {
            const chord = progression.chords[change.index]; chord.notes = [...change.value]; delete chord.hint;
            keySourceNotes.set(chord.id, [...change.value]); keySourceHints.set(chord.id, null);
          }
          if (change.kind === 'seamTechnique') progression.seams[change.index] = change.value;
        }
      }

      // ── Play ──────────────────────────────────────────────────────
      async function beginPlay({ useSuggestions }) {
        reviewController?.abort(); reviewController = null;
        clearTimeout(reviewNudgeTimer); reviewPanel.hide();
        await flushSave();
        scene.setMode('transition');
        scene.setStatus(useSuggestions ? 'Applying your selected ideas…' : 'Preparing the performance…');
        score.setPerformanceMode(true); scene.clearKeys(); scene.setProgress(0);
        playControls.show(); playControls.setPaused(false); playControls.setUndoAvailable(Boolean(undoSnapshot));
        clearTimeout(transitionTimer);
        transitionTimer = setTimeout(startPerformance, matchMedia('(prefers-reduced-motion: reduce)').matches ? 120 : TRANSITION_MS);
      }

      async function startPerformance() {
        if (destroyed) return;
        scene.setMode('playing'); scene.setStatus('LEGATO is performing');
        playbackSession = await createPlaybackSession({
          segments,
          settings: progression.settings,
          onState(state) {
            if (state === 'paused') { scene.setMode('paused'); playControls.setPaused(true); }
            if (state === 'playing') { scene.setMode('playing'); playControls.setPaused(false); }
          },
          onEventStart(event) {
            scene.highlightKeys(event.notes, true);
            scene.launchNotes(event.notes, () => score.revealSource(event.sourceId, event.seamIndex));
          },
          onEventEnd(event) { scene.highlightKeys(event.notes, false); },
          onMeasure(measure) { score.setActiveMeasure(measure); },
          onProgress(value) { scene.setProgress(value); },
          onComplete() {
            scene.clearKeys(); scene.setMode('complete'); scene.setStatus('The full score is assembled');
            agent.setReaction('The score is complete. Ask me about anything you noticed in the performance.');
          },
        });
        playbackSession?.play();
      }

      function togglePause() {
        if (!playbackSession) return;
        if (playbackSession.getState() === 'paused') playbackSession.resume();
        else playbackSession.pause();
      }

      function replay() {
        if (!playbackSession) return startPerformance();
        scene.clearKeys(); scene.setProgress(0);
        score.setPerformanceMode(false); score.setPerformanceMode(true);
        playbackSession.replay();
      }

      function stopToEdit() {
        clearTimeout(transitionTimer);
        playbackSession?.stop(); playbackSession = null;
        stopPlayback(); scene.clearKeys(); scene.setProgress(0);
        score.setPerformanceMode(false); score.setActiveMeasure(null);
        playControls.hide(); reviewPanel.hide(); scene.setMode('edit'); scene.setStatus('Back in the editing room');
        renderPanels();
      }

      function undoLegatoChanges() {
        if (!undoSnapshot) return;
        stopToEdit();
        progression = clone(undoSnapshot); undoSnapshot = null;
        keySourceNotes.clear(); keySourceHints.clear(); rememberKeySources(progression.chords, { overwrite: true });
        segments = compile(progression); renderPanels(); scheduleAutosave();
        agent.setReaction('Your score is back exactly as it was before my review changes.');
      }

      async function leaveWorkspace() {
        clearTimeout(transitionTimer); clearTimeout(localFeedbackTimer); reviewController?.abort();
        playbackSession?.stop(); stopPlayback(); scene.clearKeys();
        await flushSave();
        navigate(LANDING_HASH);
      }

      // ── Rendering ─────────────────────────────────────────────────
      function renderPanels() {
        inspector.render({ progression, selectedSeam, selectedChordId, projectName: currentName });
        score.render(segments, progression.settings);
        if (selectedChordId) score.selectChord(selectedChordId);
        else if (selectedSeam >= 0) score.selectSeam(selectedSeam);
        settingsDialog.render(progression.settings);
        scene.setProjectName(currentName);
        scene.setSettingsSummary(settingsSummary(progression.settings));
        scene.setTempo(progression.settings.tempo);
        scene.setProceedEnabled(segments.length > 0);
      }

      rememberKeySources(progression.chords, { overwrite: true });
      segments = compile(progression);
      renderPanels();
      scene.setMode('edit');
      scheduleAutosave();

      return {
        async unmount() {
          destroyed = true;
          window.removeEventListener('beforeunload', beforeUnload);
          clearTimeout(transitionTimer); clearTimeout(reviewNudgeTimer); clearTimeout(localFeedbackTimer);
          reviewController?.abort(); playbackSession?.stop(); stopPlayback();
          await flushSave();
          scene.destroy();
          root.replaceChildren();
        },
      };
    },
  };
}

function settingsSummary(settings) {
  const keyNames = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];
  return `${ settings.tempo } BPM · ${ settings.timeSig.num }/${ settings.timeSig.den } · ${ keyNames[settings.key + 7] } · ${ settings.clef.toUpperCase() }`;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function isImportantChange(change) {
  return ['addChord', 'editChord', 'deleteChord', 'technique'].includes(change?.type);
}
