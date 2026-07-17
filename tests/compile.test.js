import test from 'node:test';
import assert from 'node:assert/strict';
import { availableBeats, compile, makeChord, makeProgression } from '../js/state.js';
import { TECHNIQUES } from '../js/engine/techniques.js';
import { getAvailableTechniques } from '../js/engine/technique-eligibility.js';
import { makeDefaultProgression } from '../js/data/demo-progressions.js';

const settings={tempo:100,timeSig:{num:4,den:4},key:0,clef:'auto'};
test('all eight techniques compile inside their beat budget without re-voicing anchors', () => {
  const validPairs = {
    passingDim: [makeChord([62,65,69,72]), makeChord([64,67,71,74])],
    secondaryDom: [makeChord([60,64,67]), makeChord([62,65,69,72])],
    tritoneSub: [makeChord([67,71,74,77]), makeChord([60,64,67])],
    ii_v_i: [makeChord([57,60,64,67]), makeChord([60,64,67])],
    susPassing: [makeChord([62,65,69,72]), makeChord([60,64,67])],
    leadingTone: [makeChord([62,65,69,72]), makeChord([60,64,67])],
    scaleRun: [makeChord([60,64,67]), makeChord([65,69,72])],
    arpBridge: [makeChord([60,64,67]), makeChord([57,60,64,67])],
  };
  for(const id of Object.keys(TECHNIQUES)){
    const [from, to] = validPairs[id];
    const segments=compile(makeProgression({settings,chords:[from,to],seams:[id]}));
    assert.deepEqual(segments.filter(s=>!s.isTechnique&&s.sourceId===from.id)[0].notes,from.notes);
    const total=segments.filter(s=>s.seamIndex===0).reduce((sum,s)=>sum+s.durationBeats,0);
    assert.equal(total,TECHNIQUES[id].beatCost);
  }
});

test('generated chord stays near departing register, not low target', () => {
  const from=makeChord([72,76,79]),to=makeChord([36,40,43],1,{rootMidi:36,quality:'Major'});
  const generated=compile(makeProgression({settings,chords:[from,to],seams:['secondaryDom']})).find(s=>s.isTechnique);
  assert.ok(generated.notes.reduce((a,b)=>a+b,0)/generated.notes.length>58);
});

test('wide scale run never exceeds two beats or sixteenth-note capacity', () => {
  const from=makeChord([40]),to=makeChord([85],1,{rootMidi:85,quality:'Major'});
  const run=compile(makeProgression({settings,chords:[from,to],seams:['scaleRun']})).filter(s=>s.seamIndex===0);
  assert.ok(run.length<=8); assert.equal(run.reduce((sum,s)=>sum+s.durationBeats,0),2);
});

test('short scale runs still spend exactly their allotted budget', () => {
  const from=makeChord([60]),to=makeChord([64],1,{rootMidi:64,quality:'Major'});
  const run=compile(makeProgression({settings,chords:[from,to],seams:['scaleRun']})).filter(s=>s.seamIndex===0);
  assert.equal(run.reduce((sum,s)=>sum+s.durationBeats,0),2);
  assert.ok(run.every(s=>[4,2,1,.5,.25].includes(s.durationBeats)));
});

test('compiled startBeat is measure-relative and tempo does not alter compile output',()=>{
  const p=makeProgression({settings:{...settings,tempo:80},chords:[makeChord([60,64,67],2)],seams:[]});
  const first=compile(p); p.settings.tempo=150; const second=compile(p);
  assert.deepEqual(first,second); assert.ok(first.every(s=>s.startBeat>=0&&s.startBeat<4));
});

test('compiled duration fills the nominal progression duration without overflow', () => {
  const p=makeProgression({settings,chords:[makeChord([60,64,67],1),makeChord([65,69,72],1.5)],seams:['secondaryDom']});
  const segments=compile(p);
  assert.equal(segments.reduce((sum,s)=>sum+s.durationBeats,0),10);
});

test('cross-measure splits retain source id and measure-relative positions', () => {
  const chord=makeChord([60,64,67],1.5);
  const segments=compile(makeProgression({settings,chords:[chord],seams:[]}));
  assert.ok(segments.length>1);
  assert.ok(segments.every((segment)=>segment.sourceId===chord.id));
  assert.ok(segments.some((segment)=>segment.measureIndex===1&&segment.startBeat===0));
});

test('unknown technique behaves like direct transition and warns', () => {
  const chords=[makeChord([60,64,67]),makeChord([65,69,72])];
  const direct=compile(makeProgression({settings,chords,seams:[null]}));
  const originalWarn=console.warn; let warned=false; console.warn=()=>{warned=true;};
  const unknown=compile(makeProgression({settings,chords,seams:['unknownTechnique']}));
  console.warn=originalWarn;
  assert.deepEqual(unknown,direct); assert.equal(warned,true);
});

test('beat availability excludes techniques that cost too much', () => {
  const budget=availableBeats(.5*4);
  assert.equal(budget,1);
  assert.equal(TECHNIQUES.scaleRun.beatCost>budget,true);
  assert.equal(TECHNIQUES.leadingTone.beatCost<=budget,true);
});

test('display hint changes never alter compiled output', () => {
  const from=makeChord([60,64,67],1,{rootMidi:60,quality:'Major'});
  const to=makeChord([65,69,72],1,{rootMidi:65,quality:'Major'});
  const p=makeProgression({settings,chords:[from,to],seams:['secondaryDom']});
  const first=compile(p);
  to.hint={rootMidi:61,quality:'Dim7'};
  assert.deepEqual(compile(p),first);
});

const ids = (from, to) => getAvailableTechniques(from, to).map((technique) => technique.id);

test('eligibility only offers passing diminished for whole-step root motion and generates a real dim7', () => {
  const dm7 = makeChord([62,65,69,72]);
  const g7 = makeChord([67,71,74,77]);
  const em7 = makeChord([64,67,71,74]);
  assert.ok(!ids(dm7, g7).includes('passingDim'));
  assert.ok(ids(dm7, em7).includes('passingDim'));
  const generated = compile(makeProgression({ settings, chords: [dm7, em7], seams: ['passingDim'] }))
    .find((segment) => segment.isTechnique);
  assert.deepEqual(generated.notes.slice(1).map((note, index) => note - generated.notes[index]), [3, 3, 3]);
});

test('tritone substitutions require a dominant departure resolving up a fourth', () => {
  const e7 = makeChord([64,68,71,74]);
  const a = makeChord([69,73,76]);
  const aMajor = makeChord([69,73,76]);
  const cSharpMinor = makeChord([61,64,68]);
  assert.ok(ids(e7, a).includes('tritoneSub'));
  assert.ok(!ids(aMajor, cSharpMinor).includes('tritoneSub'));
});

test('leading tone is excluded when the departure root already is the leading tone', () => {
  const c = makeChord([60,64,67]);
  const cSharp = makeChord([61,65,68]);
  assert.ok(!ids(c, cSharp).includes('leadingTone'));
});

test('every bundled demo progression compiles without accepting an invalid seam', () => {
  const demo = makeDefaultProgression();
  const segments = compile(demo);
  assert.ok(segments.length > 0);
  demo.seams.forEach((techniqueId, index) => {
    if (techniqueId) assert.ok(ids(demo.chords[index], demo.chords[index + 1]).includes(techniqueId));
  });
});

test('compile treats a stale, invalid seam as a direct transition', () => {
  const from = makeChord([62,65,69,72]);
  const to = makeChord([67,71,74,77]);
  const direct = compile(makeProgression({ settings, chords: [from, to], seams: [null] }));
  const originalWarn = console.warn;
  console.warn = () => {};
  const invalid = compile(makeProgression({ settings, chords: [from, to], seams: ['passingDim'] }));
  console.warn = originalWarn;
  assert.deepEqual(invalid, direct);
});
