import { TECHNIQUES } from '../engine/techniques.js';

export function feedbackForChange(change, progression) {
  switch (change.type) {
    case 'tempo': {
      const bpm = progression.settings.tempo;
      if (bpm < 72) return `At ${ bpm } BPM, the voices have room to breathe and every arrival can speak clearly.`;
      if (bpm > 126) return `At ${ bpm } BPM, the progression will feel animated—keep the transitions clean and intentional.`;
      return `At ${ bpm } BPM, the piece has a steady conversational pace.`;
    }
    case 'timeSig': return `${ progression.settings.timeSig.num }/${ progression.settings.timeSig.den } gives us a new rhythmic frame. Listen for where each harmony releases.`;
    case 'key': return 'The new key signature changes the written/material accidentals. I’ll keep tonal claims grounded in the notes themselves.';
    case 'clef': return `${ title(progression.settings.clef) } clef should make this register easier to read.`;
    case 'addChord': return 'A new harmony opens another part of the conversation. Its exact voicing will shape what connects naturally.';
    case 'editChord': return 'That voicing changes the physical path between the voices. We’ll hear the difference when we proceed.';
    case 'deleteChord': return 'The phrase is leaner now. I’m listening for how the remaining arrivals rebalance.';
    case 'beats': return 'That duration changes how much space the harmony and its transition can use.';
    case 'technique': {
      const technique = change.techniqueId ? TECHNIQUES[change.techniqueId]?.name : 'a direct transition';
      return `${ technique } is now part of the route. Listen for how it changes the sense of arrival.`;
    }
    default: return 'I’m following the shape of your choices. Proceed when you want a complete listening pass.';
  }
}

function title(value) { return value === 'auto' ? 'Automatic' : `${ value[0].toUpperCase() }${ value.slice(1) }`; }
