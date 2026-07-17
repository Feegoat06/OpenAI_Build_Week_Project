import { TECHNIQUES, generateTechnique } from './techniques.js';
import { evaluateTechnique } from './technique-eligibility.js';
import { layoutEvents } from './rhythm.js';

export function compileProgression(progression) {
  const measureBeats = progression.settings.timeSig.num * 4 / progression.settings.timeSig.den;
  const events = [];
  for (let index = 0; index < progression.chords.length; index += 1) {
    const chord = progression.chords[index];
    const total = chord.bars * measureBeats;
    const requested = progression.seams[index];
    const technique = requested ? TECHNIQUES[requested] : null;
    if (requested && !technique) console.warn(`Unknown technique "${requested}" at seam ${index}; ignored.`);
    const eligibility = technique && progression.chords[index + 1]
      ? evaluateTechnique(requested, chord, progression.chords[index + 1])
      : null;
    if (requested && eligibility && !eligibility.valid) console.warn(`Technique "${requested}" at seam ${index} is invalid here: ${eligibility.reason}`);
    const available = Math.max(0, Math.min(total - 1, 4));
    const cost = technique && eligibility?.valid && technique.beatCost <= available ? technique.beatCost : 0;
    events.push({ notes: chord.notes, duration: total - cost, isTechnique: false, sourceId: chord.id, seamIndex: null });
    if (cost && progression.chords[index + 1]) {
      const generated = generateTechnique(requested, chord, progression.chords[index + 1], chord.notes, cost);
      generated.forEach((event, part) => events.push({ ...event, isTechnique: true, sourceId: `s${index}-${part}`, seamIndex: index }));
    }
  }
  return layoutEvents(events, measureBeats);
}
