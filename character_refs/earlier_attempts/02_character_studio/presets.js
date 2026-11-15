/* =====================================================================
   PRESETS, CATALOG & RANDOMIZER
   A character is plain data: change any field and all three views update.
   ===================================================================== */
const INK = '#161514';

const PRESETS = {
  'Korra study': {
    seed: 11,
    body: { female: true, heads: 6.7, shoulders: 0.9, chest: 0.66, waist: 0.5, hips: 0.72, bust: 0.6, muscle: 0.65, armSpread: 0.12, stance: 0.16 },
    face: { eyeSize: 1.1, brows: 0.9, jaw: 0.95, expression: 'neutral' },
    hair: { style: 'topknot' },
    top: { type: 'sleeveless', length: 'waist', collar: 'mandarin', closure: 'diagonal' },
    sleeves: 'none',
    arms: { gauntlets: true, armbands: true },
    waist: { type: 'sash' },
    skirt: { type: 'pelt' },
    pants: { type: 'baggy' },
    feet: { type: 'furBoots' },
    scarf: false,
    palette: { ink: INK, skin: '#a07c5c', hair: '#23211f', hairTie: '#8fb8d6', eye: '#7cc0e4', top: '#5b8db8', topTrim: '#eeece6',
      armwear: '#24465f', armTrim: '#9fb7c7', waist: '#93abc0', waistTrim: '#d9d4c4', skirt: '#6e5f52', skirtInner: '#1d3a4f', fur: '#eceae2',
      pants: '#56697a', boots: '#6e5a49', bootTrim: '#c9c3b4', scarf: '#7a1f24' },
  },
  'Korra (S4) study': null,   // filled below (variant)
  'Mako study': {
    seed: 3,
    body: { female: false, heads: 6.9, shoulders: 1.06, chest: 0.72, waist: 0.6, hips: 0.64, bust: 0, muscle: 0.55, armSpread: 0.1, stance: 0.18 },
    face: { eyeSize: 0.85, brows: 1.3, jaw: 1.05, expression: 'stern' },
    hair: { style: 'spiky' },
    top: { type: 'tunic', length: 'knee', collar: 'mandarin', closure: 'frogs' },
    sleeves: 'rolled',
    arms: { gloves: true },
    waist: { type: 'belt' },
    skirt: { type: 'none' },
    pants: { type: 'knickers' },
    feet: { type: 'wraps' },
    scarf: true,
    palette: { ink: INK, skin: '#bea181', hair: '#141313', hairTie: '#3a3d39', eye: '#8a6a3c', top: '#3c3f3b', topTrim: '#9c9a8e',
      armwear: '#1a1a18', armTrim: '#3a3d39', waist: '#1b1b18', waistTrim: '#9c9a8e', skirt: '#3c3f3b', skirtInner: '#625e53', fur: '#e0ddd5',
      pants: '#1b1b18', boots: '#1d1d1a', bootTrim: '#4d4c43', scarf: '#6a0d18' },
  },
};
PRESETS['Korra (S4) study'] = {
  ...structuredClone(PRESETS['Korra study']), seed: 12,
  hair: { style: 'bob' },
  arms: { gauntlets: true },
  waist: { type: 'medallion' },
  palette: { ...PRESETS['Korra study'].palette, top: '#4f7da3', armwear: '#22394d', pants: '#34485c', skirt: '#5f4e40', waist: '#3a4d5e', waistTrim: '#c7ccd0', boots: '#7a6550' },
};

/* What the randomizer may pick from. Add entries here as you add builders. */
const CATALOG = {
  hair: ['topknot', 'spiky', 'bob', 'bun', 'long'],
  top: [
    { type: 'sleeveless', length: 'waist', collar: 'mandarin', closure: 'diagonal' },
    { type: 'shirt', length: 'hip', collar: 'mandarin', closure: 'diagonal' },
    { type: 'shirt', length: 'waist', collar: 'high', closure: 'center' },
    { type: 'tunic', length: 'knee', collar: 'mandarin', closure: 'frogs' },
    { type: 'armor', length: 'hip', collar: 'high', closure: 'center' },
  ],
  sleeves: ['none', 'short', 'rolled', 'long'],
  arms: [{}, { gauntlets: true }, { gauntlets: true, armbands: true }, { bracers: true }, { gloves: true }, { armbands: true }],
  waist: ['sash', 'belt', 'buckle', 'medallion', 'none'],
  skirt: ['pelt', 'tassets', 'none', 'none'],
  pants: ['baggy', 'knickers', 'fitted'],
  feet: ['furBoots', 'boots', 'wraps', 'armoredBoots'],
  expression: ['neutral', 'smile', 'stern'],
};

/* Colour schemes in the same flat, slightly desaturated style. */
const SCHEMES = {
  water: { top: ['#5b8db8', '#4f7da3', '#6f9cc4'], armwear: ['#24465f', '#1f3a52'], trim: ['#eeece6', '#cfe0ea'], waist: ['#93abc0', '#3a4d5e'], skirt: ['#6e5f52', '#5f4e40'], inner: ['#1d3a4f'], pants: ['#56697a', '#34485c'], boots: ['#6e5a49', '#7a6550'], accent: ['#8fb8d6'] },
  fire: { top: ['#8e2a26', '#a33a2c', '#6e1f1f'], armwear: ['#2a1d1b', '#3b2622'], trim: ['#d6b25a', '#e2c47a'], waist: ['#2a1d1b', '#d6b25a'], skirt: ['#5a1b19', '#3b2622'], inner: ['#d6b25a'], pants: ['#2a2422', '#3b2e2a'], boots: ['#1f1a19', '#3b2622'], accent: ['#d6b25a'] },
  earth: { top: ['#4f6b3a', '#5f7a44', '#3f5a33'], armwear: ['#3a3424', '#4a4430'], trim: ['#c9b26a', '#d8c58a'], waist: ['#6b5a3a', '#c9b26a'], skirt: ['#5a4a32', '#6b5a3a'], inner: ['#2f3d27'], pants: ['#6b6650', '#4f5a3f'], boots: ['#4a3d2c', '#3a3424'], accent: ['#c9b26a'] },
  air: { top: ['#d9902e', '#e0a040', '#c97f22'], armwear: ['#7a3b1c', '#8f4a22'], trim: ['#f2d58a', '#f4e2b0'], waist: ['#e6c35c', '#7a3b1c'], skirt: ['#c97f22', '#8f4a22'], inner: ['#f2d58a'], pants: ['#d6b25a', '#c99a4a'], boots: ['#7a3b1c', '#5c2d16'], accent: ['#f2d58a'] },
  city: { top: ['#3c3f3b', '#4a4d48', '#2f3a45'], armwear: ['#1a1a18', '#2a2c2a'], trim: ['#9c9a8e', '#bdb8aa'], waist: ['#1b1b18', '#5a3a2a'], skirt: ['#3c3f3b'], inner: ['#625e53'], pants: ['#1b1b18', '#3a3530'], boots: ['#1d1d1a', '#3a2a22'], accent: ['#9c9a8e'] },
};
const SKIN = ['#f0cfae', '#e3b48e', '#cf9f78', '#bea181', '#a07c5c', '#8a6446', '#6c4a34', '#523726'];
const HAIR = ['#141313', '#23211f', '#3b2a20', '#5a3a24', '#7a4a2a', '#2e2a2a', '#8a8580'];
const EYES = ['#7cc0e4', '#8a6a3c', '#5e7d4a', '#c79a3a', '#6c7a86', '#4a3326'];

function randomCharacter(seed) {
  const r = makeRng(seed), pick = a => a[Math.floor(r() * a.length)], rng = (a, b) => +(a + r() * (b - a)).toFixed(2);
  const female = r() < 0.5;
  const scheme = SCHEMES[pick(Object.keys(SCHEMES))];
  const top = { ...pick(CATALOG.top) };
  let sleeves = top.type === 'sleeveless' ? 'none' : top.type === 'armor' ? 'long' : pick(CATALOG.sleeves.slice(1));
  const pants = pick(CATALOG.pants);
  let feet = pick(CATALOG.feet);
  if (pants === 'knickers' && feet === 'furBoots') feet = 'wraps';
  return {
    seed,
    body: {
      female, heads: rng(6.4, 7.2), shoulders: female ? rng(0.82, 0.95) : rng(0.98, 1.15), chest: female ? rng(0.62, 0.7) : rng(0.68, 0.78),
      waist: female ? rng(0.44, 0.54) : rng(0.55, 0.66), hips: female ? rng(0.68, 0.78) : rng(0.6, 0.68), bust: female ? rng(0.3, 0.8) : 0,
      muscle: rng(0.3, 0.9), armSpread: rng(0.06, 0.16), stance: rng(0.1, 0.22),
    },
    face: { eyeSize: female ? rng(1.0, 1.2) : rng(0.8, 1.0), brows: female ? rng(0.8, 1.0) : rng(1.0, 1.4), jaw: female ? rng(0.85, 1.0) : rng(0.95, 1.12), expression: pick(CATALOG.expression) },
    hair: { style: female ? pick(['topknot', 'bob', 'bun', 'long']) : pick(['spiky', 'spiky', 'bun', 'bob']) },
    top, sleeves,
    arms: { ...pick(CATALOG.arms) },
    waist: { type: pick(CATALOG.waist) },
    skirt: { type: top.length === 'knee' ? 'none' : pick(CATALOG.skirt) },
    pants: { type: pants },
    feet: { type: feet },
    scarf: r() < 0.2,
    palette: {
      ink: INK, skin: pick(SKIN), hair: pick(HAIR), hairTie: pick(scheme.accent), eye: pick(EYES),
      top: pick(scheme.top), topTrim: pick(scheme.trim), armwear: pick(scheme.armwear), armTrim: pick(scheme.trim),
      waist: pick(scheme.waist), waistTrim: pick(scheme.trim), skirt: pick(scheme.skirt), skirtInner: pick(scheme.inner),
      fur: '#eceae2', pants: pick(scheme.pants), boots: pick(scheme.boots), bootTrim: pick(scheme.trim), scarf: pick(['#7a1f24', '#6a0d18', '#2f5772', '#c9b26a']),
    },
  };
}
