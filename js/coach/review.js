import { TECHNIQUE_IDS, barsToBeats } from '../state.js';
import { chordDisplayName, noteName } from '../engine/chords.js';

const BEATS = new Set([.5, 1, 1.5, 2, 3, 4, 6, 8]);
const METERS = new Set(['3/4', '4/4', '5/4', '7/4', '6/8']);

export function normalizeReview(review, progression) {
  const occupied = new Set();
  const suggestions = [];
  for (const suggestion of review.suggestions ?? []) {
    const changes = [];
    let conflict = false;
    for (const change of suggestion.changes ?? []) {
      const normalized = normalizeChange(change, progression);
      if (!normalized) continue;
      const key = targetKey(normalized);
      if (occupied.has(key)) { conflict = true; break; }
      changes.push(normalized);
    }
    if (!conflict && changes.length) {
      changes.forEach((change) => occupied.add(targetKey(change)));
      suggestions.push({ ...suggestion, changes });
    }
  }
  return { overview: String(review.overview || 'I listened through the progression.'), suggestions };
}

export function reviewPreviews(review, progression) {
  return review.suggestions.map((suggestion) => suggestion.changes.map((change) => previewChange(change, progression)).join(' · '));
}

export function selectedChanges(review, indexes) {
  return indexes.flatMap((index) => review.suggestions[index]?.changes ?? []);
}

function normalizeChange(change, progression) {
  const index = change.targetIndex;
  switch (change.kind) {
    case 'tempo': return inRange(change.numberValue, 40, 180) ? { kind: 'tempo', value: Math.round(change.numberValue) } : null;
    case 'key': return Number.isInteger(change.numberValue) && inRange(change.numberValue, -7, 7) ? { kind: 'key', value: change.numberValue } : null;
    case 'clef': return ['auto', 'treble', 'bass'].includes(change.stringValue) ? { kind: 'clef', value: change.stringValue } : null;
    case 'meter': return METERS.has(change.stringValue) ? { kind: 'meter', value: change.stringValue } : null;
    case 'chordBeats': return progression.chords[index] && BEATS.has(change.numberValue) ? { kind: 'chordBeats', chordId: progression.chords[index].id, index, value: change.numberValue } : null;
    case 'chordVoicing': {
      const notes = [...new Set(change.notesValue ?? [])].sort((a, b) => a - b);
      return progression.chords[index] && notes.length && notes.every((note) => Number.isInteger(note) && inRange(note, 21, 108))
        ? { kind: 'chordVoicing', chordId: progression.chords[index].id, index, value: notes } : null;
    }
    case 'seamTechnique': {
      const techniqueId = change.stringValue || null;
      return index >= 0 && index < progression.seams.length && (techniqueId == null || TECHNIQUE_IDS.includes(techniqueId))
        ? { kind: 'seamTechnique', index, value: techniqueId } : null;
    }
    default: return null;
  }
}

function previewChange(change, progression) {
  const settings = progression.settings;
  switch (change.kind) {
    case 'tempo': return `${ settings.tempo } → ${ change.value } BPM`;
    case 'key': return `Key signature ${ keyName(settings.key) } → ${ keyName(change.value) }`;
    case 'clef': return `Clef ${ settings.clef } → ${ change.value }`;
    case 'meter': return `Meter ${ settings.timeSig.num }/${ settings.timeSig.den } → ${ change.value }`;
    case 'chordBeats': return `${ chordDisplayName(progression.chords[change.index], settings.key) }: ${ barsToBeats(progression.chords[change.index].bars, settings.timeSig) } → ${ change.value } beats`;
    case 'chordVoicing': return `${ chordDisplayName(progression.chords[change.index], settings.key) }: ${ progression.chords[change.index].notes.map((note) => noteName(note, settings.key)).join('–') } → ${ change.value.map((note) => noteName(note, settings.key)).join('–') }`;
    case 'seamTechnique': return `Transition ${ change.index + 1 }: ${ progression.seams[change.index] || 'direct' } → ${ change.value || 'direct' }`;
    default: return 'Musical experiment';
  }
}

function targetKey(change) {
  if (['tempo', 'key', 'clef', 'meter'].includes(change.kind)) return `settings:${ change.kind }`;
  if (change.kind.startsWith('chord')) return `${ change.kind }:${ change.chordId }`;
  return `seam:${ change.index }`;
}

function inRange(value, min, max) { return Number.isFinite(value) && value >= min && value <= max; }
function keyName(value) { return ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'][value + 7] ?? 'C'; }
