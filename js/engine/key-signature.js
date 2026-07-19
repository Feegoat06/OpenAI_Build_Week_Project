// Key signatures are notation-only: they never change the MIDI notes stored
// on a chord. Their sole job is spelling — driving whether a pitch is drawn
// as (say) F♯ or G♭ — and deciding which explicit accidentals VexFlow must
// print so the notated pitch matches the sounding pitch.
//
// Actual transposition (rewriting chord.notes into a new key) is a separate
// feature; it does not belong here.

const SHARP_LETTERS = ['f', 'c', 'g', 'd', 'a', 'e', 'b'];
const FLAT_LETTERS = ['b', 'e', 'a', 'd', 'g', 'c', 'f'];

/**
 * Which accidental the key signature imposes on a given letter, or '' if
 * the letter is left natural. `letter` is a lowercase 'a'..'g'.
 */
function keySignatureAccidental(letter, key) {
  if (key > 0 && SHARP_LETTERS.slice(0, key).includes(letter)) return '#';
  if (key < 0 && FLAT_LETTERS.slice(0, Math.abs(key)).includes(letter)) return 'b';
  return '';
}

/**
 * Given a VexFlow key string ('f#/4', 'bb/3', 'c/4', 'f##/4', …) and the
 * current key signature (-7..+7), return the accidental modifier that must be
 * drawn on that note so it reads as the intended pitch — or '' when the key
 * signature already covers it.
 *
 *   - '#' / 'b' / '##' / 'bb' : the note's spelling differs from the key sig.
 *   - 'n'                     : the note is natural but the key sig would
 *                               sharpen or flatten its letter, so a natural
 *                               sign is needed.
 *   - ''                      : the note's spelling matches the key sig.
 */
export function accidentalFor(vexKeyString, key) {
  const spelling = vexKeyString.split('/')[0];
  const letter = spelling[0];
  const actual = spelling.slice(1);
  const expected = keySignatureAccidental(letter, key);
  if (actual === expected) return '';
  return actual === '' ? 'n' : actual;
}
